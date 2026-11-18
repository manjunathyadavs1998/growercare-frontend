import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const CASE = '116446854583812124';
const careIn = { userId: '101', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'CARE_AGENT',
  permissions: ['case:read', 'case:assign', 'case:transition', 'comment:post-public', 'comment:post-internal'] }] };
const agroIn = { userId: '102', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'FIELD_AGRONOMIST',
  permissions: ['case:read', 'case:transition', 'comment:post-public', 'comment:post-internal'] }] };
const submitted = { caseId: CASE, caseNo: '71-2611-000042-7', caseType: 'PRODUCT_COMPLAINT', title: 'Leaves yellowing', status: 'SUBMITTED',
  slaState: 'ON_TRACK', growerName: 'R***** P****', growerPhoneLast4: '3210', territoryId: '1002', buCode: 'CP', raisedChannel: 'APP',
  priority: 'NORMAL', version: 0, canAssign: true, allowedTransitions: [{ toStatus: 'TRIAGED', closes: false }, { toStatus: 'NEED_INFO', closes: false }] };

/** One case on the server with optimistic locking; handlers share and change it. */
function caseServer(me: object, start: object = submitted) {
  const state = { case: { ...start } as Record<string, unknown>, transitions: [] as { body: unknown; ifMatch: string | null }[],
    assigns: [] as { body: unknown; ifMatch: string | null }[], posted: [] as { visibility: string; body: string }[] };
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(me)),
    http.get(`${API}/cases/cases/:id`, ({ params }) => (params.id === CASE
      ? HttpResponse.json(state.case, { headers: { ETag: `"${state.case.version}"` } }) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }))),
    http.get(`${API}/cases/cases/:id/activity`, () => HttpResponse.json([
      { activityId: '1', type: 'CREATED', occurredAt: '2026-11-18T08:00:00Z' },
      { activityId: '2', type: 'STATUS_CHANGED', fromStatus: 'SUBMITTED', toStatus: 'TRIAGED', note: 'Checked the photos', actorUserId: '101', occurredAt: '2026-11-18T09:00:00Z' }])),
    http.get(`${API}/cases/cases/:id/comments`, () => HttpResponse.json({ items: [
      { commentId: '2', body: 'Batch looks fine on our side', visibility: 'INTERNAL', authorRole: 'STAFF' },
      { commentId: '1', body: 'Photos attached', visibility: 'PUBLIC', authorRole: 'GROWER' }] })),
    http.post(`${API}/cases/cases/:id/comments`, async ({ request }) => {
      state.posted.push((await request.json()) as { visibility: string; body: string });
      return HttpResponse.json({ commentId: '3' }, { status: 201 });
    }),
    http.get(`${API}/cases/cases/:id/attachments`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/iam/users/assignable`, ({ request }) => {
      const q = new URL(request.url).searchParams;
      expect([q.get('territoryId'), q.get('buCode')]).toEqual(['1002', 'CP']);
      return HttpResponse.json([{ userId: '102', displayName: 'Vikram Agro', roleCodes: ['FIELD_AGRONOMIST'] }]);
    }),
    http.post(`${API}/cases/cases/:id/transitions`, async ({ request }) => {
      const ifMatch = request.headers.get('If-Match');
      const body = (await request.json()) as { toStatus: string };
      state.transitions.push({ body, ifMatch });
      if (ifMatch !== `"${state.case.version}"`) return HttpResponse.json({ code: 'STALE_VERSION' }, { status: 412 });
      state.case = { ...state.case, status: body.toStatus, version: Number(state.case.version) + 1, allowedTransitions: [{ toStatus: 'FIELD_INVESTIGATION' }] };
      return HttpResponse.json(state.case);
    }),
    http.put(`${API}/cases/cases/:id/assignee`, async ({ request }) => {
      const ifMatch = request.headers.get('If-Match');
      const body = (await request.json()) as { assigneeUserId: string };
      state.assigns.push({ body, ifMatch });
      state.case = { ...state.case, assigneeUserId: body.assigneeUserId, version: Number(state.case.version) + 1 };
      return HttpResponse.json(state.case);
    }),
  );
  return state;
}

describe('SPEC-FE-03 R202–R204 the case for staff (J5, J6)', () => {
  it('FE-E202 care.in sees the summary (masked), the offered moves, Assign and the staff-only note marked, accessibly', async () => {
    caseServer(careIn);
    const { container } = renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    expect(await screen.findByRole('heading', { name: 'Leaves yellowing' })).toBeInTheDocument();
    expect(screen.getByText(/R\*\*\*\*\* P\*\*\*\*/)).toBeInTheDocument();
    const moves = screen.getByRole('group', { name: 'Move the case to' });
    expect(within(moves).getAllByRole('button').map((b) => b.textContent)).toEqual(['Being reviewed', 'Information needed']);
    expect(screen.getByLabelText('Assign to')).toBeInTheDocument();
    const note = (await screen.findByText('Batch looks fine on our side')).closest('li')!;
    expect(within(note).getByText('staff only')).toBeInTheDocument();
    expect(await screen.findByText('“Checked the photos”')).toBeInTheDocument();             // staff see trail notes
    await expectAccessible(container);
  });

  it('FE-E202 triage with a note, then assign agro.in; each sends the current version', async () => {
    const state = caseServer(careIn);
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Being reviewed' }));
    await userEvent.type(screen.getByLabelText('Note for the trail (optional)'), 'Photos checked');
    await userEvent.click(screen.getByRole('button', { name: 'Move to Being reviewed' }));
    expect(await screen.findByText('Being reviewed', { selector: 'span' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Assign to'), await screen.findByRole('option', { name: /Vikram Agro/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(state.assigns).toHaveLength(1));
    expect(state.transitions[0]).toEqual({ body: { toStatus: 'TRIAGED', note: 'Photos checked' }, ifMatch: '"0"' });
    expect(state.assigns[0]).toEqual({ body: { assigneeUserId: '102' }, ifMatch: '"1"' });
    expect(await screen.findByText(/Assignee: Vikram Agro/)).toBeInTheDocument();
  });

  it('FE-E203 a move on a case changed in another tab is refused (412) and offers a reload', async () => {
    const state = caseServer(careIn);
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Information needed' }));
    state.case = { ...state.case, version: 1 };                                       // the other tab triaged it
    await userEvent.click(screen.getByRole('button', { name: 'Move to Information needed' }));
    expect(await screen.findByText(/Someone else changed this/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
  });

  it('FE-E202 notes default to staff-only; a public reply must be chosen', async () => {
    const state = caseServer(careIn);
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await userEvent.type(await screen.findByLabelText('Staff-only note (the grower does not see it)'), 'Check batch AZX2604-117');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Reply to the grower' }));
    await userEvent.type(screen.getByLabelText('Reply (the grower sees it)'), 'We are looking into it');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(state.posted).toHaveLength(2));
    expect(state.posted.map((p) => [p.visibility, p.body])).toEqual([['INTERNAL', 'Check batch AZX2604-117'], ['PUBLIC', 'We are looking into it']]);
  });

  it('FE-E204 agro.in (no case:assign) works the case without the assign control', async () => {
    caseServer(agroIn, { ...submitted, canAssign: false, assigneeUserId: '102' });
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    expect(await screen.findByRole('button', { name: 'Being reviewed' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Assign to')).not.toBeInTheDocument();
  });

  it('FE-E208 an out-of-scope case by URL is the not-found page', async () => {
    caseServer(careIn);
    renderRoutes(routes, { catalogs: [messages], route: '/cases/999' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('no offered move: said so', async () => {
    caseServer(careIn, { ...submitted, allowedTransitions: [], canAssign: false });
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    expect(await screen.findByText('No workflow step is open to you here.')).toBeInTheDocument();
  });
});
