import { ApiError, iam } from '@gc/api-client';
import { useAuth } from '@gc/auth';
import { PolicyProvider } from '@gc/policy';
import { AppShell, ErrorView, Spinner } from '@gc/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Outlet } from 'react-router';

/** The grower app's frame: who is signed in (/me), language, sign out. A 401 with a fresh token = no account yet. */
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
  return (
    <AppShell title={intl.formatMessage({ id: 'app.title' })} userName={auth.userName()} onSignOut={signOut}>
      {me.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {me.isError && !noAccount ? <ErrorView error={me.error} onRetry={() => void me.refetch()} /> : null}
      {me.isSuccess || noAccount ? (
        <PolicyProvider me={me.data?.data ?? null}>
          <Outlet context={{ hasAccount: !noAccount }} />
        </PolicyProvider>
      ) : null}
    </AppShell>
  );
}
