import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const tmIn = { userId: '103', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'TERRITORY_MANAGER', permissions: ['case:read', 'dashboard:read'] }] };
const whole = { scope: { countryCodes: ['IN'], territoryIds: ['1001', '1002', '1003'] }, asOf: '2026-11-18T10:00:00Z',
  openByStatus: { SUBMITTED: 4, TRIAGED: 2 }, openByType: { PRODUCT_COMPLAINT: 5, AGRONOMY_ADVICE: 1 }, sla: { atRisk: 1, breached: 2 },
  workload: [{ assigneeUserId: '102', open: 3 }], unassigned: 3 };

function overviewServer() {
  const asked: (string | null)[] = [];
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(tmIn)),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json([
      { territoryId: '1001', name: 'Maharashtra', level: 'STATE' }, { territoryId: '1002', name: 'Pune', level: 'DISTRICT' }, { territoryId: '1003', name: 'Nashik', level: 'DISTRICT' }])),
    http.get(`${API}/cases/cases/overview`, ({ request }) => {
      const t = new URL(request.url).searchParams.get('territoryId');
      asked.push(t);
      if (t === '1005') return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
      return HttpResponse.json(t ? { ...whole, scope: { countryCodes: ['IN'], territoryIds: [t] }, openByStatus: { SUBMITTED: 1 } } : whole);
    }),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/cases/case-types`, () => HttpResponse.json([])),
  );
  return asked;
}

describe('SPEC-FE-03 R205 the territory overview (J9)', () => {
  it('FE-E205 the numbers of the whole area, each linking to the same queue filter, accessibly', async () => {
    overviewServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/overview' });
    expect(await screen.findByRole('link', { name: /6\s*Open cases/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /2\s*Breached/ })).toHaveAttribute('href', '/?slaState=BREACHED');
    expect(screen.getByRole('link', { name: 'Submitted' })).toHaveAttribute('href', '/?status=SUBMITTED');
    expect(screen.getByRole('link', { name: 'Product complaint' })).toHaveAttribute('href', '/?caseType=PRODUCT_COMPLAINT');
    expect(screen.getByText('User #102')).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('FE-E205 Pune only: the request and the links carry the territory', async () => {
    const asked = overviewServer();
    renderRoutes(routes, { catalogs: [messages], route: '/overview' });
    await userEvent.selectOptions(await screen.findByLabelText('Territory'), await screen.findByRole('option', { name: 'Pune' }));
    await waitFor(() => expect(asked).toContain('1002'));
    expect(await screen.findByRole('link', { name: 'Submitted' })).toHaveAttribute('href', '/?status=SUBMITTED&territoryId=1002');
    expect(screen.getByRole('option', { name: 'Nashik' })).toBeInTheDocument();          // the picker keeps the whole scope
  });

  it('FE-E211 a territory outside the scope by URL is the not-found page', async () => {
    overviewServer();
    renderRoutes(routes, { catalogs: [messages], route: '/overview?territoryId=1005' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('only dashboard:read users see the Overview link', async () => {
    overviewServer();
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('link', { name: 'Overview' })).toBeInTheDocument();
  });
});
