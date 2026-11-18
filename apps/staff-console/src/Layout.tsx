import { ApiError, iam } from '@gc/api-client';
import { useAuth } from '@gc/auth';
import { PolicyProvider } from '@gc/policy';
import { AppShell, ErrorView, Spinner } from '@gc/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { Outlet } from 'react-router';

/** The console's frame (SPEC-FE-03 D1): staff and partners only; growers are told so and can sign out. */
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
  return (
    <AppShell title={intl.formatMessage({ id: 'app.title' })} userName={auth.userName()} onSignOut={signOut}>
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
