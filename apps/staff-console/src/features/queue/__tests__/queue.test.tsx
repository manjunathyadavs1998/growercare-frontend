import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const careIn = { userId: '101', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'CARE_AGENT', permissions: ['case:read', 'case:assign', 'grower:read'] }] };
const caseA = { caseId: '116446854583812124', caseNo: '71-2611-000042-7', title: 'Leaves yellowing', caseType: 'PRODUCT_COMPLAINT',
  status: 'SUBMITTED', slaState: 'AT_RISK', growerName: 'R***** P****', createdAt: '2026-11-18T08:00:00Z' };

function queueServer(pages: Record<string, { items: object[]; nextCursor?: string }> = { first: { items: [caseA] } }) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(careIn)),
    http.get(`${API}/cases/case-types`, () => HttpResponse.json([{ caseType: 'PRODUCT_COMPLAINT', statuses: [{ status: 'SUBMITTED' }, { status: 'TRIAGED' }] }])),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json([{ territoryId: '1002', name: 'Pune', level: 'DISTRICT' }])),
    http.get(`${API}/cases/cases`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requests.push(query);
      return HttpResponse.json(pages[query.get('cursor') ?? 'first'] ?? { items: [] });
    }),
  );
  return requests;
}

describe('SPEC-FE-03 R200 the queue (J5)', () => {
  it('FE-E200 cases in scope with masked growers and SLA state, accessibly', async () => {
    queueServer();
    const { container } = renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('link', { name: '71-2611-000042-7' })).toHaveAttribute('href', '/cases/116446854583812124');
    expect(screen.getByRole('cell', { name: 'R***** P****' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'At risk' })).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('FE-E200 the SLA chip filters at-risk work and the filter lives in the URL', async () => {
    const requests = queueServer();
    const { router } = renderRoutes(routes, { catalogs: [messages] });
    await screen.findByRole('link', { name: '71-2611-000042-7' });
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    await waitFor(() => expect(requests.at(-1)?.get('slaState')).toBe('AT_RISK'));
    expect(router.state.location.search).toBe('?slaState=AT_RISK');
    expect(screen.getByRole('button', { name: 'At risk' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('FE-E200 a bookmarked filter set is applied on load', async () => {
    const requests = queueServer();
    renderRoutes(routes, { catalogs: [messages], route: '/?status=SUBMITTED&territoryId=1002&assignedToMe=true' });
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const q = requests.at(-1)!;
    expect([q.get('status'), q.get('territoryId'), q.get('assignedToMe')]).toEqual(['SUBMITTED', '1002', 'true']);
    expect(await screen.findByRole('checkbox', { name: 'Assigned to me' })).toBeChecked();
  });

  it('FE-E200 status, type and territory selects narrow the queue', async () => {
    const requests = queueServer();
    renderRoutes(routes, { catalogs: [messages] });
    await screen.findByRole('link', { name: '71-2611-000042-7' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), await screen.findByRole('option', { name: 'Being reviewed' }));
    await userEvent.selectOptions(screen.getByLabelText('Territory'), 'Pune');
    await waitFor(() => expect([requests.at(-1)?.get('status'), requests.at(-1)?.get('territoryId')]).toEqual(['TRIAGED', '1002']));
  });

  it('FE-E200 more cases follow the cursor; nothing matching says so', async () => {
    queueServer({ first: { items: [caseA], nextCursor: 'c1' }, c1: { items: [{ ...caseA, caseId: '2', caseNo: '71-2611-000041-9' }] } });
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('link', { name: '71-2611-000041-9' })).toBeInTheDocument();
  });

  it('FE-E200 empty', async () => {
    queueServer({ first: { items: [] } });
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText('No cases match these filters.')).toBeInTheDocument();
  });
});
