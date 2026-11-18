import { cases, grower } from '@gc/api-client';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from 'react-router';
import { MAX_FILES, uploadAttachment } from './upload';

const POLL = 30_000;
const COMMENTS_PAGE = 50;
type CommentPage = Awaited<ReturnType<typeof cases.comments>>;

/** SPEC-FE-02 R107: one case as the grower sees it: status, timeline, conversation, files, sharing. */
export function CaseDetail() {
  const intl = useIntl();
  const { caseId = '' } = useParams();
  const view = cases.useGet(caseId, { query: { refetchInterval: POLL, retry: false } });
  const c = view.data?.data;

  if (view.isPending) return <Spinner label={intl.formatMessage({ id: 'shell.loading' })} />;
  if (view.isError) return <ErrorView error={view.error} onRetry={() => void view.refetch()} />;
  return (
    <article className="space-y-6">
      <header>
        <p className="text-sm text-slate-600">{c?.caseNo} · {intl.formatMessage({ id: `caseType.${c?.caseType}`, defaultMessage: c?.caseType })}</p>
        <h1 className="text-xl font-semibold">{c?.title}</h1>
        <p className="mt-2">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm text-emerald-900">
            {intl.formatMessage({ id: `caseStatus.${c?.status}`, defaultMessage: c?.status })}
          </span>
          {c?.closedAt ? <span className="ms-2 text-sm text-slate-600"><FormattedMessage id="detail.closedOn" values={{ date: intl.formatDate(c.closedAt, { dateStyle: 'medium' }) }} /></span> : null}
        </p>
        <p className="mt-3 whitespace-pre-line text-slate-800">{c?.description}</p>
      </header>
      <Sharing caseId={caseId} />
      <Conversation caseId={caseId} />
      <Files caseId={caseId} closed={Boolean(c?.closedAt)} />
      <Timeline caseId={caseId} />
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The trail, in plain words; staff notes never reach a grower (the API strips them). */
function Timeline({ caseId }: { caseId: string }) {
  const intl = useIntl();
  const activity = cases.useActivity(caseId, { query: { refetchInterval: POLL } });
  const items = [...(activity.data?.data ?? [])].reverse();
  return (
    <Section title={intl.formatMessage({ id: 'detail.timeline' })}>
      {activity.isError ? <ErrorView error={activity.error} onRetry={() => void activity.refetch()} /> : null}
      <ol className="space-y-2">
        {items.map((a) => (
          <li key={a.activityId} className="text-sm">
            <span className="text-slate-500">{a.occurredAt ? intl.formatDate(a.occurredAt, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>{' '}
            {a.type === 'STATUS_CHANGED'
              ? <FormattedMessage id="activity.STATUS_CHANGED" values={{ to: intl.formatMessage({ id: `caseStatus.${a.toStatus}`, defaultMessage: a.toStatus }) }} />
              : intl.formatMessage({ id: `activity.${a.type}`, defaultMessage: a.type })}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Public comments, oldest first; a new one shows at once and is rolled back if the server refuses it. */
function Conversation({ caseId }: { caseId: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const id = useId();
  const [body, setBody] = useState('');
  const key = ['cases', caseId, 'comments'];
  const comments = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => cases.comments(caseId, { limit: COMMENTS_PAGE, ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
    refetchInterval: POLL,
  });
  const post = useMutation({
    mutationFn: (text: string) => cases.post(caseId, { body: text, clientMsgId: crypto.randomUUID(), visibility: 'PUBLIC' }),
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<InfiniteData<CommentPage>>(key);
      queryClient.setQueryData<InfiniteData<CommentPage>>(key, (data) => data && {
        ...data,
        pages: data.pages.map((p, i) => (i === 0
          ? { ...p, data: { ...p.data, items: [{ commentId: 'pending', body: text, authorRole: 'GROWER', visibility: 'PUBLIC' }, ...(p.data.items ?? [])] } }
          : p)),
      });
      setBody('');
      return { before };
    },
    onError: (_e, text, context) => {
      queryClient.setQueryData(key, context?.before);
      setBody(text);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  // pages come newest first: show the conversation oldest first
  const items = [...(comments.data?.pages.flatMap((p) => p.data.items ?? []) ?? [])].reverse();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) post.mutate(body.trim());
  };
  return (
    <Section title={intl.formatMessage({ id: 'detail.conversation' })}>
      {comments.hasNextPage ? (
        <Button variant="secondary" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
          <FormattedMessage id="detail.olderComments" />
        </Button>
      ) : null}
      {comments.isError ? <ErrorView error={comments.error} onRetry={() => void comments.refetch()} /> : null}
      {comments.isSuccess && items.length === 0 ? <p className="text-sm text-slate-600"><FormattedMessage id="detail.noComments" /></p> : null}
      <ul className="mt-2 space-y-3">
        {items.map((m) => (
          <li key={m.commentId} className={`rounded-md p-3 ${m.authorRole === 'GROWER' ? 'ms-8 bg-emerald-50' : 'me-8 bg-slate-100'}`}>
            <p className="text-xs text-slate-600">
              <FormattedMessage id={m.authorRole === 'GROWER' ? 'detail.author.you' : m.authorRole === 'PARTNER' ? 'detail.author.retailer' : 'detail.author.team'} />
              {m.createdAt ? <> · {intl.formatDate(m.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</> : null}
            </p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-4" noValidate>
        <label htmlFor={id} className="block text-sm font-medium"><FormattedMessage id="detail.reply" /></label>
        <textarea id={id} className="mt-1 block min-h-24 w-full rounded-md border border-slate-300 px-3 py-2" maxLength={4000}
          value={body} onChange={(e) => setBody(e.target.value)} />
        {post.isError ? <div className="mt-2"><ErrorView error={post.error} /></div> : null}
        <Button type="submit" className="mt-2" disabled={!body.trim() || post.isPending}><FormattedMessage id="detail.send" /></Button>
      </form>
    </Section>
  );
}

/** Files: download the clean ones; add more while the case is open (R107). */
function Files({ caseId, closed }: { caseId: string; closed: boolean }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const id = useId();
  const files = cases.useList1(caseId, { query: { refetchInterval: POLL } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: cases.getList1QueryKey(caseId) });
  const download = useMutation({
    mutationFn: (attachmentId: string) => cases.download(caseId, attachmentId),
    onSuccess: (r) => { if (r.data.url) window.open(r.data.url, '_blank', 'noopener'); },
  });
  const add = useMutation({
    mutationFn: async (chosen: File[]) => {
      const results = await Promise.allSettled(chosen.map((f) => uploadAttachment(caseId, f)));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) throw (failed as PromiseRejectedResult).reason;
    },
    onSettled: refresh,
  });
  return (
    <Section title={intl.formatMessage({ id: 'detail.files' })}>
      {files.isError ? <ErrorView error={files.error} onRetry={() => void files.refetch()} /> : null}
      {files.isSuccess && (files.data.data.items ?? []).length === 0 ? <p className="text-sm text-slate-600"><FormattedMessage id="detail.noFiles" /></p> : null}
      <ul className="space-y-2">
        {(files.data?.data.items ?? []).map((f) => (
          <li key={f.attachmentId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {intl.formatMessage({ id: `attachmentKind.${f.kind}`, defaultMessage: f.kind })}
              {f.createdAt ? <> · {intl.formatDate(f.createdAt, { dateStyle: 'medium' })}</> : null}
            </span>
            {f.status === 'CLEAN' ? (
              <Button variant="secondary" disabled={download.isPending} onClick={() => download.mutate(f.attachmentId ?? '')}
                aria-label={intl.formatMessage({ id: 'detail.download.named' }, { kind: intl.formatMessage({ id: `attachmentKind.${f.kind}`, defaultMessage: f.kind }) })}>
                <FormattedMessage id="detail.download" />
              </Button>
            ) : (
              <span className="text-slate-600">{intl.formatMessage({ id: `attachmentStatus.${f.status}`, defaultMessage: f.status })}</span>
            )}
          </li>
        ))}
      </ul>
      {download.isError ? <div className="mt-2"><ErrorView error={download.error} /></div> : null}
      {!closed ? (
        <div className="mt-4">
          <label htmlFor={id} className="block text-sm font-medium"><FormattedMessage id="detail.addFiles" values={{ max: MAX_FILES }} /></label>
          <input id={id} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="mt-1 block w-full text-sm" disabled={add.isPending}
            onChange={(e) => { const chosen = [...(e.target.files ?? [])].slice(0, MAX_FILES); if (chosen.length) add.mutate(chosen); e.target.value = ''; }} />
          {add.isPending ? <p className="mt-1 text-sm" role="status"><FormattedMessage id="detail.uploading" /></p> : null}
          {add.isError ? <div className="mt-2"><ErrorView error={add.error} /></div> : null}
        </div>
      ) : null}
    </Section>
  );
}

/**
 * Share with the grower's own retailer (their preferred partner) or stop sharing. The case view does not carry its
 * shares, so the latest SHARED / UNSHARED entry of the trail tells the current state (a grower shares with one org).
 */
function Sharing({ caseId }: { caseId: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const me = grower.useMe();
  const partner = me.data?.data.preferredPartnerOrgId;
  const activity = cases.useActivity(caseId, { query: { refetchInterval: POLL } });
  const last = [...(activity.data?.data ?? [])].reverse().find((a) => a.type === 'SHARED' || a.type === 'UNSHARED');
  const shared = last?.type === 'SHARED';
  const toggle = useMutation({
    mutationFn: async (): Promise<void> => {
      if (shared) await cases.unshare(caseId, partner ?? '');
      else await cases.share(caseId, partner ?? '');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cases.getActivityQueryKey(caseId) }),
  });
  if (!partner) return null;
  return (
    <Section title={intl.formatMessage({ id: 'detail.sharing' })}>
      <p className="text-sm"><FormattedMessage id={shared ? 'detail.shared' : 'detail.notShared'} /></p>
      <Button variant="secondary" className="mt-2" disabled={toggle.isPending || activity.isPending} onClick={() => toggle.mutate()}>
        <FormattedMessage id={shared ? 'detail.unshare' : 'detail.share'} />
      </Button>
      {toggle.isError ? <div className="mt-2"><ErrorView error={toggle.error} /></div> : null}
    </Section>
  );
}
