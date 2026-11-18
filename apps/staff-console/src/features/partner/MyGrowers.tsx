import { grower } from '@gc/api-client';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useLocation } from 'react-router';

/** SPEC-FE-03 R207: the growers this shop onboarded or is preferred by (SPEC-GRW-06), newest first. */
export function MyGrowers() {
  const intl = useIntl();
  const onboarded = (useLocation().state ?? null) as { onboarded?: string } | null;
  const list = useInfiniteQuery({
    queryKey: ['grower', 'partner', 'mine'],
    queryFn: ({ pageParam, signal }) => grower.partnerGrowers({ partner: 'mine', ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.data.items ?? []) ?? [];
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold"><FormattedMessage id="partner.growers.title" /></h1>
        <Link to="/partner/growers/new" className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          <FormattedMessage id="partner.onboard" />
        </Link>
      </div>
      {onboarded?.onboarded ? (
        <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
          <FormattedMessage id="partner.onboarded" values={{ name: onboarded.onboarded }} />
        </p>
      ) : null}
      {list.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {list.isError ? <div className="mt-4"><ErrorView error={list.error} onRetry={() => void list.refetch()} /></div> : null}
      {list.isSuccess && items.length === 0 ? <p className="mt-4 text-slate-600"><FormattedMessage id="partner.growers.none" /></p> : null}
      <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {items.map((g) => (
          <li key={g.growerId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              {g.displayName} <span className="text-sm text-slate-600">· …{g.phoneLast4} · {intl.formatMessage({ id: `growerStatus.${g.status}`, defaultMessage: g.status })}</span>
            </span>
            {g.status === 'PENDING_CONSENT'
              ? <Link className="text-sm text-emerald-800 underline" to={`/partner/growers/${g.growerId}/consent`}><FormattedMessage id="partner.finishConsent" /></Link>
              : null}
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
