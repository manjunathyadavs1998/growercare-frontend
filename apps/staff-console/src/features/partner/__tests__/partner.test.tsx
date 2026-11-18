import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const retailerIn = { userId: '201', userType: 'PARTNER', homeCountry: 'IN', partnerOrgId: '501',
  grants: [{ roleCode: 'RETAILER_USER', permissions: ['case:read', 'case:create', 'grower:create', 'grower:read', 'grower:consent'] }] };
const NEW = '110165911145499999';

/** The shop's side of onboarding, recorded. */
function partnerServer() {
  const state = { status: 'PENDING_CONSENT', registered: [] as { body: Record<string, unknown>; key: string | null }[],
    noticeLanguage: '', confirmed: [] as Record<string, unknown>[] };
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(retailerIn)),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json([
      { territoryId: '1001', name: 'Maharashtra', level: 'STATE' }, { territoryId: '1002', name: 'Pune', level: 'DISTRICT', parentTerritoryId: '1001' }])),
    http.post(`${API}/grower/growers`, async ({ request }) => {
      state.registered.push({ body: (await request.json()) as Record<string, unknown>, key: request.headers.get('Idempotency-Key') });
      return HttpResponse.json({ growerId: NEW, status: 'PENDING_CONSENT' }, { status: 201 });
    }),
    http.get(`${API}/grower/growers/:id`, ({ params }) => HttpResponse.json({ growerId: params.id, displayName: 'S**** G*****', phoneLast4: '1234',
      status: state.status, countryCode: 'IN', preferredLanguage: 'mr' })),
    http.get(`${API}/grower/consent-notices`, ({ request }) => {
      state.noticeLanguage = new URL(request.url).searchParams.get('language') ?? '';
      return HttpResponse.json({ items: [
        { purpose: 'SERVICE', version: 'in-2026-11', title: 'सेवा', body: 'तुमची माहिती प्रकरणांसाठी वापरली जाते.' },
        { purpose: 'DATA_SHARING_RETAILER', version: 'in-2026-11', title: 'विक्रेत्यासोबत माहिती', body: 'तुमचे विक्रेते तुमची प्रकरणे पाहू शकतात.' }] });
    }),
    http.post(`${API}/grower/growers/:id/verifications`, () => HttpResponse.json({ verificationId: '88', phoneLast4: '1234' }, { status: 202 })),
    http.post(`${API}/grower/growers/:id/verifications/:vid/confirm`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      state.confirmed.push(body);
      if (body.code === '000000') return HttpResponse.json({ code: 'BUSINESS_RULE_VIOLATION', rule: 'grower.otp-invalid', attemptsLeft: 4 }, { status: 422 });
      state.status = 'ACTIVE';
      return HttpResponse.json({ growerId: NEW, status: 'ACTIVE' });
    }),
    http.get(`${API}/grower/growers`, () => HttpResponse.json({ items: [
      { growerId: NEW, displayName: 'S**** G*****', phoneLast4: '1234', status: state.status },
      { growerId: '7', displayName: 'R***** P****', phoneLast4: '3210', status: 'PENDING_CONSENT' }] })),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/cases/case-types`, () => HttpResponse.json([])),
  );
  return state;
}

describe('SPEC-FE-03 R207 the retailer area', () => {
  it('FE-E207 retailer.in onboards "Smoke Grower"; the grower reads the notices in Marathi, chooses, and reads out the code', async () => {
    const state = partnerServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/partner/growers/new' });
    await userEvent.type(await screen.findByLabelText("Grower's name"), 'Smoke Grower');
    await userEvent.type(screen.getByLabelText('Mobile number'), '+91 98111 11234');
    await userEvent.selectOptions(screen.getByLabelText('District'), await screen.findByRole('option', { name: 'Pune' }));
    expect(screen.getByLabelText("Grower's language")).toHaveValue('mr');
    await expectAccessible(container);
    await userEvent.click(screen.getByRole('button', { name: 'Register and continue' }));

    expect(await screen.findByRole('heading', { name: 'सेवा' })).toBeInTheDocument();
    expect(state.noticeLanguage).toBe('mr');
    expect(state.registered[0]?.body).toEqual({ displayName: 'Smoke Grower', phone: '+919811111234', preferredLanguage: 'mr', territoryId: '1002', preferredPartnerOrgId: '501' });
    expect(state.registered[0]?.key).toMatch(/^[0-9a-f-]{36}$/);

    await userEvent.click(screen.getByRole('checkbox', { name: 'विक्रेत्यासोबत माहिती' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send the code to …1234' }));
    const code = await screen.findByLabelText('Code the grower received on …1234');
    await userEvent.type(code, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Wrong code. 4 attempts left.')).toBeInTheDocument();
    await userEvent.clear(code);
    await userEvent.type(code, '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('S**** G***** is now active.')).toBeInTheDocument();
    expect(state.confirmed[1]).toEqual({ code: '654321', language: 'mr', noticeVersion: 'in-2026-11',
      consents: [{ purpose: 'SERVICE', granted: true }, { purpose: 'DATA_SHARING_RETAILER', granted: true }] });
  });

  it('FE-E207 the shop is not set as preferred retailer when unticked', async () => {
    const state = partnerServer();
    renderRoutes(routes, { catalogs: [messages], route: '/partner/growers/new' });
    await userEvent.type(await screen.findByLabelText("Grower's name"), 'Second Grower');
    await userEvent.type(screen.getByLabelText('Mobile number'), '+919811111235');
    await userEvent.selectOptions(screen.getByLabelText('District'), await screen.findByRole('option', { name: 'Pune' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'My shop is their preferred retailer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Register and continue' }));
    await waitFor(() => expect(state.registered).toHaveLength(1));
    expect(state.registered[0]?.body).not.toHaveProperty('preferredPartnerOrgId');
  });

  it('FE-E207 a phone number must be E.164 before registering', async () => {
    partnerServer();
    renderRoutes(routes, { catalogs: [messages], route: '/partner/growers/new' });
    await userEvent.type(await screen.findByLabelText("Grower's name"), 'Third');
    await userEvent.type(screen.getByLabelText('Mobile number'), '98111');
    await userEvent.selectOptions(screen.getByLabelText('District'), await screen.findByRole('option', { name: 'Pune' }));
    expect(screen.getByRole('button', { name: 'Register and continue' })).toBeDisabled();
  });

  it('FE-E207 my growers: pending ones offer "finish consent"; the partner navigation', async () => {
    partnerServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/partner/growers' });
    expect(await screen.findByText(/R\*\*\*\*\* P\*\*\*\*/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Finish consent' })[0]).toHaveAttribute('href', `/partner/growers/${NEW}/consent`);
    expect(screen.getByRole('link', { name: 'Our cases' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My growers' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Grower lookup' })).not.toBeInTheDocument();
    await expectAccessible(container);
  });

  it('an already active grower needs no consent step', async () => {
    const state = partnerServer();
    state.status = 'ACTIVE';
    renderRoutes(routes, { catalogs: [messages], route: `/partner/growers/${NEW}/consent` });
    expect(await screen.findByText('This grower is already active.')).toBeInTheDocument();
  });
});
