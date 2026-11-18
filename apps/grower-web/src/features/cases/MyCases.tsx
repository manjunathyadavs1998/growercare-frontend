import { cases } from '@gc/api-client';
import { ErrorView, Spinner } from '@gc/ui-kit';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@gc/ui-kit';

const PAGE = 20;

/** SPEC-FE-02 R104: the grower's own cases, newest first, refreshed every 30 s (PRD §8: polling, no push in Phase 1). */
export function MyCases() {
  const intl = useIntl();
  const list = useInfiniteQuery({
    queryKey: ['cases', 'mine', PAGE],
    queryFn: ({ pageParam, signal }) => cases.list({ limit: PAGE, ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const items = list.data?.pages.flatMap((p) => p.data.items ?? []) ?? [];

  return (
    <section>
      <h1 className="text-xl font-semibold"><FormattedMessage id="cases.mine.title" /></h1>
      {list.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {list.isError ? <div className="mt-4"><ErrorView error={list.error} onRetry={() => void list.refetch()} /></div> : null}
      {list.isSuccess && items.length === 0 ? <p className="mt-4 text-slate-600"><FormattedMessage id="cases.mine.empty" /></p> : null}
      <ul className="mt-4 space-y-3">
        {items.map((c) => (
          <li key={c.caseId} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{c.title}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm text-emerald-900">
                {intl.formatMessage({ id: `caseStatus.${c.status}`, defaultMessage: c.status })}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {c.caseNo} · {intl.formatMessage({ id: `caseType.${c.caseType}`, defaultMessage: c.caseType })}
              {c.createdAt ? <> · {intl.formatDate(c.createdAt, { dateStyle: 'medium' })}</> : null}
            </p>
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <Button variant="secondary" className="mt-4" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          <FormattedMessage id="action.more" />
        </Button>
      ) : null}
    </section>
  );
}
