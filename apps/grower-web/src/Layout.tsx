import { useAuth } from '@gc/auth';
import { AppShell } from '@gc/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Outlet } from 'react-router';
import { OnboardingGate } from './features/onboarding/OnboardingGate';

/** The grower app's frame: language, sign out; every screen sits behind onboarding (SPEC-FE-02 D2). */
export function Layout() {
  const intl = useIntl();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const signOut = () => {
    queryClient.clear();
    void auth.signOut();
  };
  return (
    <AppShell title={intl.formatMessage({ id: 'app.title' })} userName={auth.userName()} onSignOut={signOut}>
      <OnboardingGate>
        <Outlet />
      </OnboardingGate>
    </AppShell>
  );
}
