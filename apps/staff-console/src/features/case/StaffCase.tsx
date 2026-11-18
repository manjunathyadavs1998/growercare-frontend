import { cases, iam } from '@gc/api-client';
import { usePolicy } from '@gc/policy';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from 'react-router';

const POLL = 30_000;
type Case = cases.CaseView;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** SPEC-FE-03 R202–R204 (J5, J6): one case for staff: summary, workflow actions, assignment, conversation, files, trail. */
export function StaffCase() {
  const intl = useIntl();
  const { caseId = '' } = useParams();
  const view = cases.useGet(caseId, { query: { refetchInterval: POLL, retry: false } });
  if (view.isPending) return <Spinner label={intl.formatMessage({ id: 'shell.loading' })} />;
  if (view.isError) return <ErrorView error={view.error} onRetry={() => void view.refetch()} />;
  const c = view.data.data;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Summary c={c} />
        <Conversation caseId={caseId} />
        <Trail caseId={caseId} />
      </div>
      <div className="space-y-4">
        <Actions c={c} />
        <Files caseId={caseId} />
      </div>
    </div>
  );
}

function Summary({ c }: { c: Case }) {
  const intl = useIntl();
  const label = (prefix: string, code?: string) => intl.formatMessage({ id: `${prefix}.${code}`, defaultMessage: code });
  return (
    <header className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{c.caseNo} · {label('caseType', c.caseType)}</p>
      <h1 className="text-xl font-semibold">{c.title}</h1>
      <p className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-900">{label('caseStatus', c.status)}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5">{label('sla', c.slaState)}</span>
        {c.slaDueAt && !c.closedAt ? <span><FormattedMessage id="case.slaDue" values={{ date: intl.formatDate(c.slaDueAt, { dateStyle: 'medium', timeStyle: 'short' }) }} /></span> : null}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-600"><FormattedMessage id="case.grower" /></dt>
        <dd>{c.growerName} {c.growerPhoneLast4 ? <span className="text-slate-600">· …{c.growerPhoneLast4}</span> : null}</dd>
        <dt className="text-slate-600"><FormattedMessage id="case.channel" /></dt>
        <dd>{label('channel', c.raisedChannel)}</dd>
        {c.productId ? <><dt className="text-slate-600"><FormattedMessage id="case.product" /></dt><dd>{c.productId}{c.batchNo ? ` · ${c.batchNo}` : ''}</dd></> : null}
        <dt className="text-slate-600"><FormattedMessage id="case.priority" /></dt>
        <dd>{label('priority', c.priority)}</dd>
      </dl>
      <p className="mt-3 whitespace-pre-line">{c.description}</p>
    </header>
  );
}

/** Workflow edges and the assign action exactly as the API offers them (SPEC-CASE-09); stale → 412 → reload. */
function Actions({ c }: { c: Case }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const noteId = useId();
  const assigneeId = useId();
  const [toStatus, setToStatus] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const ifMatch = { headers: { 'If-Match': `"${c.version ?? 0}"` } };
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: cases.getGetQueryKey(c.caseId ?? '') }),
    queryClient.invalidateQueries({ queryKey: cases.getActivityQueryKey(c.caseId ?? '') }),
    queryClient.invalidateQueries({ queryKey: ['cases', 'queue'] }),
  ]);
  const staff = iam.useAssignable({ territoryId: c.territoryId ?? '', buCode: c.buCode ?? '' },
    { query: { enabled: Boolean(c.canAssign && c.territoryId && c.buCode) } });
  const transition = useMutation({
    mutationFn: () => cases.transition(c.caseId ?? '', { toStatus: toStatus ?? '', ...(note.trim() ? { note: note.trim() } : {}) }, ifMatch),
    onSuccess: () => { setToStatus(null); setNote(''); return refresh(); },
  });
  const assign = useMutation({
    mutationFn: () => cases.assign(c.caseId ?? '', { assigneeUserId: assignee }, ifMatch),
    onSuccess: () => { setAssignee(''); return refresh(); },
  });
  const people = staff.data?.data ?? [];
  const current = people.find((p) => p.userId === c.assigneeUserId)?.displayName ?? (c.assigneeUserId ? `#${c.assigneeUserId}` : null);
  const failure = transition.error ?? assign.error;
  const edges = c.allowedTransitions ?? [];

  return (
    <Section title={intl.formatMessage({ id: 'case.actions' })}>
      <p className="text-sm"><FormattedMessage id="case.assignee" />: {current ?? <FormattedMessage id="case.unassigned" />}</p>
      {failure ? <div className="mt-3"><ErrorView error={failure} onReload={() => { transition.reset(); assign.reset(); void refresh(); }} /></div> : null}
      {edges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={intl.formatMessage({ id: 'case.moveTo' })}>
          {edges.map((e) => (
            <Button key={e.toStatus} variant={toStatus === e.toStatus ? 'primary' : 'secondary'} aria-pressed={toStatus === e.toStatus}
              onClick={() => setToStatus(e.toStatus ?? null)}>
              {intl.formatMessage({ id: `caseStatus.${e.toStatus}`, defaultMessage: e.toStatus })}
            </Button>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-slate-600"><FormattedMessage id="case.noMoves" /></p>}
      {toStatus ? (
        <form className="mt-3" onSubmit={(e: FormEvent) => { e.preventDefault(); transition.mutate(); }} noValidate>
          <label htmlFor={noteId} className="block text-sm font-medium"><FormattedMessage id="case.note" /></label>
          <textarea id={noteId} className="mt-1 block min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={1000}
            value={note} onChange={(e) => setNote(e.target.value)} />
          {edges.find((e) => e.toStatus === toStatus)?.closes ? <p className="mt-1 text-sm text-amber-900"><FormattedMessage id="case.closes" /></p> : null}
          <Button type="submit" className="mt-2" disabled={transition.isPending}>
            <FormattedMessage id="case.confirmMove" values={{ status: intl.formatMessage({ id: `caseStatus.${toStatus}`, defaultMessage: toStatus }) }} />
          </Button>
        </form>
      ) : null}
      {c.canAssign ? (
        <form className="mt-4" onSubmit={(e: FormEvent) => { e.preventDefault(); if (assignee) assign.mutate(); }} noValidate>
          <label htmlFor={assigneeId} className="block text-sm font-medium"><FormattedMessage id="case.assignTo" /></label>
          <select id={assigneeId} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm" value={assignee}
            onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{intl.formatMessage({ id: 'case.choosePerson' })}</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.displayName} ({(p.roleCodes ?? []).map((r) => intl.formatMessage({ id: `role.${r}`, defaultMessage: r })).join(', ')})
              </option>
            ))}
          </select>
          {staff.isError ? <div className="mt-2"><ErrorView error={staff.error} /></div> : null}
          <Button type="submit" className="mt-2" disabled={!assignee || assign.isPending}><FormattedMessage id="case.assign" /></Button>
        </form>
      ) : null}
    </Section>
  );
}

/** Public replies and staff-only notes, clearly told apart (R202). */
function Conversation({ caseId }: { caseId: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const policy = usePolicy();
  const id = useId();
  const canInternal = policy.can('comment:post-internal');
  const canPublic = policy.can('comment:post-public');
  const [visibility, setVisibility] = useState<'INTERNAL' | 'PUBLIC'>(canInternal ? 'INTERNAL' : 'PUBLIC');
  const [body, setBody] = useState('');
  const key = ['cases', caseId, 'comments'];
  const comments = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => cases.comments(caseId, { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
    refetchInterval: POLL,
  });
  const post = useMutation({
    mutationFn: () => cases.post(caseId, { body: body.trim(), clientMsgId: crypto.randomUUID(), visibility }),
    onSuccess: () => { setBody(''); return queryClient.invalidateQueries({ queryKey: key }); },
  });
  const items = [...(comments.data?.pages.flatMap((p) => p.data.items ?? []) ?? [])].reverse();
  return (
    <Section title={intl.formatMessage({ id: 'case.conversation' })}>
      {comments.hasNextPage ? <Button variant="secondary" onClick={() => void comments.fetchNextPage()}><FormattedMessage id="case.older" /></Button> : null}
      {comments.isError ? <ErrorView error={comments.error} onRetry={() => void comments.refetch()} /> : null}
      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.commentId} className={`rounded-md p-3 ${m.visibility === 'INTERNAL' ? 'border border-dashed border-amber-400 bg-amber-50' : 'bg-slate-100'}`}>
            <p className="text-xs text-slate-600">
              {intl.formatMessage({ id: `authorRole.${m.authorRole}`, defaultMessage: m.authorRole })}
              {m.visibility === 'INTERNAL' ? <> · <strong><FormattedMessage id="case.staffOnly" /></strong></> : null}
              {m.createdAt ? <> · {intl.formatDate(m.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</> : null}
            </p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ul>
      {canInternal || canPublic ? (
        <form className="mt-4" onSubmit={(e: FormEvent) => { e.preventDefault(); if (body.trim()) post.mutate(); }} noValidate>
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only"><FormattedMessage id="case.visibility" /></legend>
            {canInternal ? (
              <label className="flex items-center gap-2"><input type="radio" name={`${id}-v`} checked={visibility === 'INTERNAL'} onChange={() => setVisibility('INTERNAL')} />
                <FormattedMessage id="case.internalNote" /></label>
            ) : null}
            {canPublic ? (
              <label className="flex items-center gap-2"><input type="radio" name={`${id}-v`} checked={visibility === 'PUBLIC'} onChange={() => setVisibility('PUBLIC')} />
                <FormattedMessage id="case.publicReply" /></label>
            ) : null}
          </fieldset>
          <label htmlFor={id} className="mt-2 block text-sm font-medium">
            <FormattedMessage id={visibility === 'INTERNAL' ? 'case.writeNote' : 'case.writeReply'} />
          </label>
          <textarea id={id} className={`mt-1 block min-h-24 w-full rounded-md border px-3 py-2 ${visibility === 'INTERNAL' ? 'border-amber-400' : 'border-slate-300'}`}
            maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          {post.isError ? <div className="mt-2"><ErrorView error={post.error} /></div> : null}
          <Button type="submit" className="mt-2" disabled={!body.trim() || post.isPending}>
            <FormattedMessage id={visibility === 'INTERNAL' ? 'case.addNote' : 'case.sendReply'} />
          </Button>
        </form>
      ) : null}
    </Section>
  );
}

function Files({ caseId }: { caseId: string }) {
  const intl = useIntl();
  const files = cases.useList1(caseId, { query: { refetchInterval: POLL } });
  const download = useMutation({
    mutationFn: (attachmentId: string) => cases.download(caseId, attachmentId),
    onSuccess: (r) => { if (r.data.url) window.open(r.data.url, '_blank', 'noopener'); },
  });
  const kind = (k?: string) => intl.formatMessage({ id: `attachmentKind.${k}`, defaultMessage: k });
  return (
    <Section title={intl.formatMessage({ id: 'case.files' })}>
      {files.isError ? <ErrorView error={files.error} onRetry={() => void files.refetch()} /> : null}
      {files.isSuccess && (files.data.data.items ?? []).length === 0 ? <p className="text-sm text-slate-600"><FormattedMessage id="case.noFiles" /></p> : null}
      <ul className="space-y-2 text-sm">
        {(files.data?.data.items ?? []).map((f) => (
          <li key={f.attachmentId} className="flex flex-wrap items-center justify-between gap-2">
            <span>{kind(f.kind)}</span>
            {f.status === 'CLEAN'
              ? <Button variant="secondary" aria-label={intl.formatMessage({ id: 'case.download.named' }, { kind: kind(f.kind) })}
                  onClick={() => download.mutate(f.attachmentId ?? '')}><FormattedMessage id="case.download" /></Button>
              : <span className="text-slate-600">{intl.formatMessage({ id: `attachmentStatus.${f.status}`, defaultMessage: f.status })}</span>}
          </li>
        ))}
      </ul>
      {download.isError ? <div className="mt-2"><ErrorView error={download.error} /></div> : null}
    </Section>
  );
}

/** The full trail with staff notes (staff see what growers do not). */
function Trail({ caseId }: { caseId: string }) {
  const intl = useIntl();
  const activity = cases.useActivity(caseId, { query: { refetchInterval: POLL } });
  const status = (s?: string) => intl.formatMessage({ id: `caseStatus.${s}`, defaultMessage: s });
  return (
    <Section title={intl.formatMessage({ id: 'case.trail' })}>
      {activity.isError ? <ErrorView error={activity.error} onRetry={() => void activity.refetch()} /> : null}
      <ol className="space-y-2 text-sm">
        {[...(activity.data?.data ?? [])].reverse().map((a) => (
          <li key={a.activityId}>
            <span className="text-slate-500">{a.occurredAt ? intl.formatDate(a.occurredAt, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>{' '}
            {intl.formatMessage({ id: `staffActivity.${a.type}`, defaultMessage: a.type })}
            {a.type === 'STATUS_CHANGED' ? <> · {status(a.fromStatus)} → {status(a.toStatus)}</> : null}
            {a.actorUserId ? <span className="text-slate-500"> · #{a.actorUserId}</span> : null}
            {a.note ? <p className="ms-4 text-slate-700">“{a.note}”</p> : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
