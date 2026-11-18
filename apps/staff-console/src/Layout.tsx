import { ApiError, iam } from '@gc/api-client';
import { useAuth } from '@gc/auth';
import { PolicyProvider, policyFor } from '@gc/policy';
import { AppShell, ErrorView, Spinner } from '@gc/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { NavLink, Outlet } from 'react-router';

/** SPEC-FE-03 D1: staff and partners only; the navigation shows what the signed-in user's grants allow. */
export function Layout() {
  const intl = useIntl();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const me = iam.useMe({ query: { retry: false } });
  const signOut = () => {
    queryClient.clear();
    void auth.signOut();
  };
  const noAccount = me.error instanceof ApiError && me.error.status === 401;
  const grower = me.data?.data.userType === 'GROWER';
  const policy = policyFor(me.data?.data ?? null);
  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-block border-b-2 px-3 py-3 text-sm ${isActive ? 'border-emerald-700 font-medium text-emerald-900' : 'border-transparent text-slate-700'}`;
  const nav = me.isSuccess && !grower ? (
    <>
      {policy.can('case:read') ? <NavLink to="/" end className={link}><FormattedMessage id="nav.queue" /></NavLink> : null}
      {policy.can('grower:read') ? <NavLink to="/growers" className={link}><FormattedMessage id="nav.growers" /></NavLink> : null}
    </>
  ) : undefined;
  return (
    <AppShell title={intl.formatMessage({ id: 'app.title' })} userName={auth.userName()} onSignOut={signOut} nav={nav}>
      {me.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {noAccount ? <p role="alert"><FormattedMessage id="console.noAccount" /></p> : null}
      {me.isError && !noAccount ? <ErrorView error={me.error} onRetry={() => void me.refetch()} /> : null}
      {grower ? (
        <section>
          <h1 className="text-xl font-semibold"><FormattedMessage id="console.staffOnly.title" /></h1>
          <p className="mt-2"><FormattedMessage id="console.staffOnly.body" /></p>
        </section>
      ) : null}
      {me.isSuccess && !grower ? (
        <PolicyProvider me={me.data.data}>
          <Outlet />
        </PolicyProvider>
      ) : null}
    </AppShell>
  );
}
