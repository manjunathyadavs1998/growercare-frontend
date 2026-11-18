import { iam } from '@gc/api-client';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';

/** SPEC-FE-03 R206 (J8): the user directory (SPEC-IAM-02): names masked for growers as IAM returns them. */
export function Users() {
  const intl = useIntl();
  const ids = { q: useId(), type: useId() };
  const [draft, setDraft] = useState({ q: '', type: '' });
  const [search, setSearch] = useState({ q: '', type: '' });
  const users = useInfiniteQuery({
    queryKey: ['iam', 'users', search],
    queryFn: ({ pageParam, signal }) => iam.search({
      ...(search.q ? { q: search.q } : {}), ...(search.type ? { type: search.type } : {}), ...(pageParam ? { cursor: pageParam } : {}),
    }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  });
  const items = users.data?.pages.flatMap((p) => p.data.items ?? []) ?? [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSearch({ q: draft.q.trim(), type: draft.type });
  };
  return (
    <section>
      <h1 className="text-xl font-semibold"><FormattedMessage id="users.title" /></h1>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <div>
          <label htmlFor={ids.q} className="block text-sm"><FormattedMessage id="users.search" /></label>
          <input id={ids.q} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        </div>
        <div>
          <label htmlFor={ids.type} className="block text-sm"><FormattedMessage id="users.type" /></label>
          <select id={ids.type} className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            <option value="">{intl.formatMessage({ id: 'queue.all' })}</option>
            {['STAFF', 'PARTNER', 'GROWER'].map((t) => <option key={t} value={t}>{intl.formatMessage({ id: `userType.${t}` })}</option>)}
          </select>
        </div>
        <Button type="submit"><FormattedMessage id="users.find" /></Button>
      </form>
      {users.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {users.isError ? <div className="mt-4"><ErrorView error={users.error} onRetry={() => void users.refetch()} /></div> : null}
      {users.isSuccess && items.length === 0 ? <p className="mt-4 text-slate-600"><FormattedMessage id="users.none" /></p> : null}
      <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {items.map((u) => (
          <li key={u.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <Link to={`/users/${u.userId}`} className="text-emerald-800 underline">{u.displayName}</Link>
            <span className="text-sm text-slate-600">
              {intl.formatMessage({ id: `userType.${u.userType}`, defaultMessage: u.userType })} · {u.homeCountry}
              {u.status !== 'ACTIVE' ? <> · {intl.formatMessage({ id: `userStatus.${u.status}`, defaultMessage: u.status })}</> : null}
            </span>
          </li>
        ))}
      </ul>
      {users.hasNextPage ? (
        <Button variant="secondary" className="mt-4" disabled={users.isFetchingNextPage} onClick={() => void users.fetchNextPage()}>
          <FormattedMessage id="action.more" />
        </Button>
      ) : null}
    </section>
  );
}
