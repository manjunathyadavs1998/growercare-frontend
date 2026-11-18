import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const adminIn = { userId: '104', userType: 'STAFF', homeCountry: 'IN',
  grants: [{ roleCode: 'COUNTRY_ADMIN', countryCodes: ['IN'], permissions: ['user:read', 'grant:read', 'grant:create', 'grant:revoke'] }] };
const vikram = { userId: '102', userType: 'STAFF', homeCountry: 'IN', displayName: 'Vikram Agro', status: 'ACTIVE',
  grants: [{ grantId: '5', roleCode: 'FIELD_AGRONOMIST', territoryIds: ['1002'], buCodes: ['CP'] }] };

function adminServer() {
  const state = { user: structuredClone(vikram), searches: [] as URLSearchParams[], created: [] as unknown[], revoked: [] as { id: string; reason: string | null }[] };
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(adminIn)),
    http.get(`${API}/iam/users`, ({ request }) => {
      const q = new URL(request.url).searchParams;
      state.searches.push(q);
      return HttpResponse.json({ items: [{ userId: '102', userType: 'STAFF', homeCountry: 'IN', displayName: 'Vikram Agro', status: 'ACTIVE' },
        { userId: '1', userType: 'GROWER', homeCountry: 'IN', displayName: 'R***** P****', status: 'ACTIVE' }] });
    }),
    http.get(`${API}/iam/users/:id`, ({ params }) => (params.id === '102' ? HttpResponse.json(state.user) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }))),
    http.get(`${API}/iam/reference/roles`, () => HttpResponse.json([
      { roleCode: 'CARE_AGENT', scopeKind: 'COUNTRY', allowedUserType: 'STAFF' },
      { roleCode: 'TERRITORY_MANAGER', scopeKind: 'TERRITORY', allowedUserType: 'STAFF' },
      { roleCode: 'RETAILER_USER', scopeKind: 'ORG', allowedUserType: 'PARTNER' }])),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json([
      { territoryId: '1002', name: 'Pune', level: 'DISTRICT' }, { territoryId: '1005', name: 'Bengaluru Rural', level: 'DISTRICT' }])),
    http.post(`${API}/iam/grants`, async ({ request }) => {
      const body = (await request.json()) as { roleCode: string; territoryIds?: string[] };
      state.created.push(body);
      state.user.grants.push({ grantId: '9', roleCode: body.roleCode, territoryIds: body.territoryIds ?? [], buCodes: [] });
      return HttpResponse.json({ grantId: '9' }, { status: 201 });
    }),
    http.delete(`${API}/iam/grants/:id`, ({ params, request }) => {
      state.revoked.push({ id: String(params.id), reason: new URL(request.url).searchParams.get('reason') });
      state.user.grants = state.user.grants.filter((g) => g.grantId !== params.id);
      return HttpResponse.json({ grantId: params.id });
    }),
  );
  return state;
}

describe('SPEC-FE-03 R206 users and grants (J8)', () => {
  it('FE-E206 the directory: search by name and type; grower names stay masked', async () => {
    const state = adminServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/users' });
    expect(await screen.findByRole('link', { name: 'R***** P****' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name or user id'), 'vik');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'STAFF');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect([state.searches.at(-1)?.get('q'), state.searches.at(-1)?.get('type')]).toEqual(['vik', 'STAFF']));
    await expectAccessible(container);
  });

  it('FE-E206 admin.in grants agro.in TERRITORY_MANAGER for Karnataka until a date, then revokes it with a reason', async () => {
    const state = adminServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/users/102' });
    expect(await screen.findByText(/Agronomist/)).toBeInTheDocument();
    expect(await screen.findByText(/Pune/)).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Territory manager' });
    const roles = within(screen.getByLabelText('Role')).getAllByRole('option').map((o) => o.textContent);
    expect(roles).toEqual(['Choose a role…', 'Care agent', 'Territory manager']);         // partner roles are not offered for staff
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'TERRITORY_MANAGER');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Bengaluru Rural' }));
    await userEvent.type(screen.getByLabelText('Valid until (optional)'), '2026-11-19');
    await userEvent.type(screen.getByLabelText('Reason'), 'Cover Karnataka this week');
    await expectAccessible(container);
    await userEvent.click(screen.getByRole('button', { name: 'Grant' }));
    expect(await screen.findByText(/Territory manager/, { selector: 'strong' })).toBeInTheDocument();
    expect(state.created[0]).toMatchObject({ userId: '102', roleCode: 'TERRITORY_MANAGER', territoryIds: ['1005'], reason: 'Cover Karnataka this week' });
    expect((state.created[0] as { validTo: string }).validTo).toMatch(/^2026-11-19T/);

    await userEvent.click(screen.getByRole('button', { name: 'Revoke Territory manager' }));
    await userEvent.type(screen.getByLabelText('Reason for revoking'), 'Back to normal');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke grant' }));
    await waitFor(() => expect(screen.queryByText(/Territory manager/, { selector: 'strong' })).not.toBeInTheDocument());
    expect(state.revoked).toEqual([{ id: '9', reason: 'Back to normal' }]);
  });

  it('FE-E206 a country-scoped role takes the country; nothing is sent without a reason', async () => {
    const state = adminServer();
    renderRoutes(routes, { catalogs: [messages], route: '/users/102' });
    await screen.findByRole('option', { name: 'Care agent' });
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'CARE_AGENT');
    const grant = screen.getByRole('button', { name: 'Grant' });
    expect(grant).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seeds' }));
    await userEvent.type(screen.getByLabelText('Reason'), 'Seeds hotline');
    await userEvent.click(grant);
    await waitFor(() => expect(state.created).toHaveLength(1));
    expect(state.created[0]).toEqual({ userId: '102', roleCode: 'CARE_AGENT', countryCodes: ['IN'], buCodes: ['SEEDS'], reason: 'Seeds hotline' });
  });

  it('FE-E208 an unknown or out-of-scope user is the not-found page', async () => {
    adminServer();
    renderRoutes(routes, { catalogs: [messages], route: '/users/105' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });
});
