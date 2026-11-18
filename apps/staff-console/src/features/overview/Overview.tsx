import { cases, iam } from '@gc/api-client';
import { ErrorView, Spinner } from '@gc/ui-kit';
import { useId, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useSearchParams } from 'react-router';

function Tile({ label, value, to }: { label: ReactNode; value: number; to?: string }) {
  const body = (
    <>
      <span className="block text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-slate-600">{label}</span>
    </>
  );
  return to
    ? <Link to={to} className="block rounded-md border border-slate-200 bg-white p-3 hover:border-emerald-600">{body}</Link>
    : <div className="rounded-md border border-slate-200 bg-white p-3">{body}</div>;
}

/**
 * SPEC-FE-03 R205 (J9): the territory overview, computed by case-service with the list's own scope rules (DSH-2).
 * Each status, type and SLA number opens the queue with the same filters, so the numbers can be checked.
 */
export function Overview() {
  const intl = useIntl();
  const id = useId();
  const [params, setParams] = useSearchParams();
  const territoryId = params.get('territoryId') ?? '';
  const overview = cases.useOverview(territoryId ? { territoryId } : undefined, { query: { refetchInterval: 30_000, retry: false } });
  const territories = iam.useTerritories();
  const names = new Map((territories.data?.data ?? []).map((t) => [t.territoryId, t.name]));
  const o = overview.data?.data;
  // the picker offers the overview's whole scope even while one territory is shown
  const whole = cases.useOverview(undefined, { query: { enabled: territoryId !== '' } });
  const scope = (territoryId ? whole.data?.data.scope : o?.scope)?.territoryIds ?? [];
  const queue = (filter: Record<string, string>) => `/?${new URLSearchParams({ ...filter, ...(territoryId ? { territoryId } : {}) })}`;
  const open = Object.values(o?.openByStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold"><FormattedMessage id="overview.title" /></h1>
        <div>
          <label htmlFor={id} className="block text-sm"><FormattedMessage id="queue.territory" /></label>
          <select id={id} className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={territoryId}
            onChange={(e) => setParams(e.target.value ? { territoryId: e.target.value } : {}, { replace: true })}>
            <option value="">{intl.formatMessage({ id: 'overview.allTerritories' })}</option>
            {scope.map((t) => <option key={t} value={t}>{names.get(t) ?? t}</option>)}
          </select>
        </div>
      </div>
      {overview.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {overview.isError ? <div className="mt-4"><ErrorView error={overview.error} onRetry={() => void overview.refetch()} /></div> : null}
      {o ? (
        <>
          <p className="mt-1 text-sm text-slate-600">
            <FormattedMessage id="overview.asOf" values={{ time: o.asOf ? intl.formatTime(o.asOf) : '' }} />
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={<FormattedMessage id="overview.open" />} value={open} to={queue({})} />
            <Tile label={<FormattedMessage id="sla.AT_RISK" />} value={o.sla?.atRisk ?? 0} to={queue({ slaState: 'AT_RISK' })} />
            <Tile label={<FormattedMessage id="sla.BREACHED" />} value={o.sla?.breached ?? 0} to={queue({ slaState: 'BREACHED' })} />
            <Tile label={<FormattedMessage id="overview.unassigned" />} value={o.unassigned ?? 0} />
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <h2 className="font-medium"><FormattedMessage id="overview.byStatus" /></h2>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(o.openByStatus ?? {}).map(([status, n]) => (
                  <li key={status} className="flex justify-between gap-2">
                    <Link className="text-emerald-800 underline" to={queue({ status })}>{intl.formatMessage({ id: `caseStatus.${status}`, defaultMessage: status })}</Link>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-medium"><FormattedMessage id="overview.byType" /></h2>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(o.openByType ?? {}).map(([type, n]) => (
                  <li key={type} className="flex justify-between gap-2">
                    <Link className="text-emerald-800 underline" to={queue({ caseType: type })}>{intl.formatMessage({ id: `caseType.${type}`, defaultMessage: type })}</Link>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-medium"><FormattedMessage id="overview.workload" /></h2>
              <ul className="mt-2 space-y-1 text-sm">
                {(o.workload ?? []).map((w) => (
                  <li key={w.assigneeUserId} className="flex justify-between gap-2">
                    <span><FormattedMessage id="overview.user" values={{ id: w.assigneeUserId }} /></span>
                    <span className="tabular-nums">{w.open}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
