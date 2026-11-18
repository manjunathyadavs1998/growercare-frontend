import { cases, iam } from '@gc/api-client';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useSearchParams } from 'react-router';

export const SLA_STATES = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'MISSED'] as const;
const PAGE = 50;
const FILTERS = ['status', 'caseType', 'territoryId', 'slaState', 'assignedToMe', 'growerId', 'productId', 'batchNo'] as const;
type Filter = (typeof FILTERS)[number];

const SLA_STYLE: Record<string, string> = {
  BREACHED: 'bg-red-100 text-red-900', AT_RISK: 'bg-amber-100 text-amber-900', MISSED: 'bg-red-50 text-red-800',
  ON_TRACK: 'bg-slate-100 text-slate-700', MET: 'bg-emerald-50 text-emerald-900',
};

/**
 * SPEC-FE-03 R200 (J5): the queue: every case the caller may read, with the filters in the URL (D4, bookmarkable;
 * no personal data: a grower filter is an id). Newest first as the API returns it; the SLA chips filter at-risk work.
 */
export function Queue() {
  const intl = useIntl();
  const [params, setParams] = useSearchParams();
  const filter = Object.fromEntries(FILTERS.flatMap((f) => (params.get(f) ? [[f, params.get(f)!]] : []))) as Partial<Record<Filter, string>>;
  const types = cases.useCaseTypes();
  const territories = iam.useTerritories();
  const set = (name: Filter, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  };
  const list = useInfiniteQuery({
    queryKey: ['cases', 'queue', filter],
    queryFn: ({ pageParam, signal }) => cases.list({
      limit: PAGE, ...filter, assignedToMe: filter.assignedToMe === 'true' ? true : undefined,
      slaState: filter.slaState as cases.ListSlaState | undefined, ...(pageParam ? { cursor: pageParam } : {}),
    }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const items = list.data?.pages.flatMap((p) => p.data.items ?? []) ?? [];
  const statuses = [...new Set((types.data?.data ?? []).flatMap((t) => (t.statuses ?? []).map((s) => s.status ?? '')))].filter(Boolean);
  const ids = { status: useId(), caseType: useId(), territoryId: useId() };
  const select = 'mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <section>
      <h1 className="text-xl font-semibold"><FormattedMessage id="queue.title" /></h1>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={ids.status} className="text-sm"><FormattedMessage id="queue.status" /></label>
          <select id={ids.status} className={select} value={filter.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">{intl.formatMessage({ id: 'queue.all' })}</option>
            {statuses.map((s) => <option key={s} value={s}>{intl.formatMessage({ id: `caseStatus.${s}`, defaultMessage: s })}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={ids.caseType} className="text-sm"><FormattedMessage id="queue.type" /></label>
          <select id={ids.caseType} className={select} value={filter.caseType ?? ''} onChange={(e) => set('caseType', e.target.value)}>
            <option value="">{intl.formatMessage({ id: 'queue.all' })}</option>
            {(types.data?.data ?? []).map((t) => <option key={t.caseType} value={t.caseType}>{intl.formatMessage({ id: `caseType.${t.caseType}`, defaultMessage: t.caseType })}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={ids.territoryId} className="text-sm"><FormattedMessage id="queue.territory" /></label>
          <select id={ids.territoryId} className={select} value={filter.territoryId ?? ''} onChange={(e) => set('territoryId', e.target.value)}>
            <option value="">{intl.formatMessage({ id: 'queue.all' })}</option>
            {(territories.data?.data ?? []).map((t) => <option key={t.territoryId} value={t.territoryId}>{t.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={filter.assignedToMe === 'true'} onChange={(e) => set('assignedToMe', e.target.checked ? 'true' : '')} />
          <FormattedMessage id="queue.assignedToMe" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={intl.formatMessage({ id: 'queue.sla' })}>
        {(['', 'AT_RISK', 'BREACHED'] as const).map((s) => (
          <button key={s || 'all'} type="button" aria-pressed={(filter.slaState ?? '') === s} onClick={() => set('slaState', s)}
            className={`rounded-full border px-3 py-1 text-sm ${(filter.slaState ?? '') === s ? 'border-emerald-700 bg-emerald-50 font-medium' : 'border-slate-300 bg-white'}`}>
            {s ? intl.formatMessage({ id: `sla.${s}` }) : intl.formatMessage({ id: 'queue.allSla' })}
          </button>
        ))}
        {filter.growerId ? (
          <button type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm" onClick={() => set('growerId', '')}>
            <FormattedMessage id="queue.growerFilter" /> ✕
          </button>
        ) : null}
      </div>

      {list.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {list.isError ? <div className="mt-4"><ErrorView error={list.error} onRetry={() => void list.refetch()} /></div> : null}
      {list.isSuccess && items.length === 0 ? <p className="mt-4 text-slate-600"><FormattedMessage id="queue.empty" /></p> : null}
      {items.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only"><FormattedMessage id="queue.title" /></caption>
            <thead className="bg-slate-50 text-start">
              <tr>
                {['queue.col.case', 'queue.col.title', 'queue.col.type', 'queue.col.status', 'queue.col.sla', 'queue.col.grower', 'queue.col.created'].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-start font-medium"><FormattedMessage id={h} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.caseId} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap"><Link className="text-emerald-800 underline" to={`/cases/${c.caseId}`}>{c.caseNo}</Link></td>
                  <td className="px-3 py-2">{c.title}</td>
                  <td className="px-3 py-2">{intl.formatMessage({ id: `caseType.${c.caseType}`, defaultMessage: c.caseType })}</td>
                  <td className="px-3 py-2">{intl.formatMessage({ id: `caseStatus.${c.status}`, defaultMessage: c.status })}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 ${SLA_STYLE[c.slaState ?? ''] ?? ''}`}>{intl.formatMessage({ id: `sla.${c.slaState}`, defaultMessage: c.slaState })}</span></td>
                  <td className="px-3 py-2">{c.growerName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.createdAt ? intl.formatDate(c.createdAt, { dateStyle: 'medium' }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.hasNextPage ? (
        <Button variant="secondary" className="mt-4" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          <FormattedMessage id="action.more" />
        </Button>
      ) : null}
    </section>
  );
}
