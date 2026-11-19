import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const CASE = '116446854583812124';
const view = { caseId: CASE, caseNo: '71-2611-000042-7', caseType: 'PRODUCT_COMPLAINT', title: 'Leaves yellowing after spray',
  description: 'Brown spots three days after spraying.', status: 'TRIAGED', version: 1 };

/** One case on the server; handlers share and change it. */
function caseServer(options: { comments?: object[]; shared?: boolean; closed?: boolean; postStatus?: number; partner?: string | null; trail?: 'SHARED' | 'UNSHARED' } = {}) {
  const state = {
    comments: [...(options.comments ?? [{ commentId: '1', body: 'We are looking into it.', authorRole: 'CARE', visibility: 'PUBLIC', createdAt: '2026-11-18T09:00:00Z' }])],
    activity: [
      { activityId: '1', type: 'CREATED', occurredAt: '2026-11-18T08:00:00Z' },
      { activityId: '2', type: 'STATUS_CHANGED', fromStatus: 'SUBMITTED', toStatus: 'TRIAGED', occurredAt: '2026-11-18T08:30:00Z' },
      ...(options.trail ? [{ activityId: '3', type: options.trail, occurredAt: '2026-11-18T08:40:00Z' }] : []),
    ],
    posted: [] as { body: string; clientMsgId: string; visibility: string }[],
    shareCalls: [] as string[],
    shared: options.shared ?? false,             // SPEC-CASE-11: the view lists the orgs it is shared with
  };
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })),
    http.get(`${API}/grower/growers/me`, () => HttpResponse.json({ growerId: '1', status: 'ACTIVE', preferredPartnerOrgId: options.partner === null ? undefined : (options.partner ?? '501') })),
    http.get(`${API}/cases/cases/:id`, ({ params }) => (params.id === CASE
      ? HttpResponse.json({ ...view, sharedWithPartnerOrgIds: state.shared ? ['501'] : [],
          ...(options.closed ? { status: 'CLOSED', closedAt: '2026-11-18T10:00:00Z' } : {}) }, { headers: { ETag: '"1"' } })
      : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }))),
    http.get(`${API}/cases/cases/:id/activity`, () => HttpResponse.json(state.activity)),
    http.get(`${API}/cases/cases/:id/comments`, () => HttpResponse.json({ items: [...state.comments].reverse() })),       // newest first
    http.post(`${API}/cases/cases/:id/comments`, async ({ request }) => {
      const body = (await request.json()) as { body: string; clientMsgId: string; visibility: string };
      state.posted.push(body);
      if (options.postStatus) return HttpResponse.json({ code: 'BUSINESS_RULE_VIOLATION', detail: 'The case is closed' }, { status: options.postStatus });
      state.comments.push({ commentId: String(state.comments.length + 1), body: body.body, authorRole: 'GROWER', visibility: 'PUBLIC' });
      return HttpResponse.json(state.comments.at(-1), { status: 201 });
    }),
    http.get(`${API}/cases/cases/:id/attachments`, () => HttpResponse.json({ items: [
      { attachmentId: '501', kind: 'INVOICE', status: 'CLEAN', createdAt: '2026-11-18T08:00:00Z' },
      { attachmentId: '502', kind: 'PHOTO', status: 'PENDING' }] })),
    http.get(`${API}/cases/cases/:id/attachments/:att/download`, () => HttpResponse.json({ url: 'http://storage.local/clean/501?sig=x', expiresAt: '2026-11-18T10:01:00Z' })),
    http.put(`${API}/cases/cases/:id/shares/:org`, ({ params }) => {
      state.shareCalls.push(`share ${params.org}`);
      state.shared = true;
      state.activity.push({ activityId: '9', type: 'SHARED', occurredAt: '2026-11-18T11:00:00Z' });
      return HttpResponse.json({ caseId: CASE, partnerOrgId: params.org });
    }),
    http.delete(`${API}/cases/cases/:id/shares/:org`, ({ params }) => {
      state.shareCalls.push(`unshare ${params.org}`);
      state.shared = false;
      state.activity.push({ activityId: '10', type: 'UNSHARED', occurredAt: '2026-11-18T11:05:00Z' });
      return new HttpResponse(null, { status: 200 });
    }),
  );
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe('SPEC-FE-02 R107 case detail', () => {
  it('FE-E107 status, description, timeline, conversation and files, accessibly', async () => {
    caseServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    expect(await screen.findByRole('heading', { name: 'Leaves yellowing after spray' })).toBeInTheDocument();
    expect(screen.getByText('Being reviewed', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('Status: Being reviewed')).toBeInTheDocument();
    expect(await screen.findByText('We are looking into it.')).toBeInTheDocument();
    expect(screen.getByText('GrowerCare team', { exact: false })).toBeInTheDocument();
    expect(await screen.findByText('Being checked')).toBeInTheDocument();                   // the PENDING photo
    await expectAccessible(container);
  });

  it('FE-E107 a comment appears at once and stays', async () => {
    const state = caseServer();
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await userEvent.type(await screen.findByLabelText('Write a message'), 'Leaves still yellow');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Leaves still yellow')).toBeInTheDocument();
    await waitFor(() => expect(state.posted).toHaveLength(1));
    expect(state.posted[0]).toMatchObject({ body: 'Leaves still yellow', visibility: 'PUBLIC' });
    expect(state.posted[0]?.clientMsgId).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByLabelText('Write a message')).toHaveValue('');
  });

  it('FE-E107 a refused comment is rolled back and the text kept', async () => {
    caseServer({ postStatus: 422 });
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await userEvent.type(await screen.findByLabelText('Write a message'), 'Too late');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('The case is closed')).toBeInTheDocument();
    expect(screen.getByLabelText('Write a message')).toHaveValue('Too late');
    expect(screen.queryByText('Too late', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('FE-E111 the view decides the share state, not the trail', async () => {
    caseServer({ shared: true, trail: 'UNSHARED' });
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    expect(await screen.findByText('Your retailer can see this case and help.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop sharing' })).toBeInTheDocument();
  });

  it('FE-E107 FE-E111 sharing with my retailer, then stopping', async () => {
    const state = caseServer();
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    expect(await screen.findByText('Your retailer cannot see this case.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Share with my retailer' }));
    expect(await screen.findByText('Your retailer can see this case and help.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByText('Your retailer cannot see this case.')).toBeInTheDocument();
    expect(state.shareCalls).toEqual(['share 501', 'unshare 501']);
  });

  it('FE-E107 no preferred retailer: no sharing section', async () => {
    caseServer({ partner: null });
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await screen.findByRole('heading', { name: 'Leaves yellowing after spray' });
    expect(screen.queryByRole('button', { name: 'Share with my retailer' })).not.toBeInTheDocument();
  });

  it('FE-E107 a clean file downloads through a short-lived link; a closed case takes no new files', async () => {
    caseServer({ closed: true });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRoutes(routes, { catalogs: [messages], route: `/cases/${CASE}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Download Invoice' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('http://storage.local/clean/501?sig=x', '_blank', 'noopener'));
    expect(screen.queryByLabelText(/Add photos or PDFs/)).not.toBeInTheDocument();
    expect(screen.getByText(/closed on/)).toBeInTheDocument();
  });

  it('FE-E108 another grower\'s case by URL is the not-found page', async () => {
    caseServer();
    renderRoutes(routes, { catalogs: [messages], route: '/cases/999' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('My cases links to the case', async () => {
    caseServer();
    server.use(http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [{ ...view }] })));
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('link', { name: 'Leaves yellowing after spray' }));
    const header = await screen.findByRole('heading', { name: 'Leaves yellowing after spray' });
    expect(within(header.parentElement!).getByText(/71-2611-000042-7/)).toBeInTheDocument();
  });
});
