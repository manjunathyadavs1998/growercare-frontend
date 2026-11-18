import { useAuth } from '@gc/auth';
import { AppShell } from '@gc/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { NavLink, Outlet } from 'react-router';
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
  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-block border-b-2 px-3 py-3 text-sm ${isActive ? 'border-emerald-700 font-medium text-emerald-900' : 'border-transparent text-slate-700'}`;
  const nav = (
    <>
      <NavLink to="/" end className={link}><FormattedMessage id="nav.cases" /></NavLink>
      <NavLink to="/farms" className={link}><FormattedMessage id="nav.farms" /></NavLink>
    </>
  );
  return (
    <AppShell title={intl.formatMessage({ id: 'app.title' })} userName={auth.userName()} onSignOut={signOut} nav={nav}>
      <OnboardingGate>
        <Outlet />
      </OnboardingGate>
    </AppShell>
  );
}
