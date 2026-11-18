import { configureApi } from '@gc/api-client';
import { AuthProvider, browserNavigator, createAuth, loadConfig, oidcPort, userManagerSettings } from '@gc/auth';
import { currentLanguage } from '@gc/i18n';
import { QueryClient } from '@tanstack/react-query';
import { UserManager } from 'oidc-client-ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// SPEC-FE-01: configuration at runtime, sign-in before the first render, every API call through the gateway.
async function start() {
  const config = await loadConfig();
  const manager = new UserManager(userManagerSettings({ authority: config.oidcAuthority, clientId: config.oidcClientId }, window.location.origin));
  const auth = createAuth(oidcPort(manager), browserNavigator());
  configureApi({
    apiBase: config.apiBase,
    getAccessToken: auth.accessToken,
    getLanguage: currentLanguage,
    // a 401 while the token is still fresh means "no account yet" (SPEC-FE-02 R100); only an expired session signs in again
    onUnauthorized: () => { if (!auth.tokenStillValid()) void auth.signIn(); },
  });
  if ((await auth.start()) === 'redirecting') return;
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } } });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider client={auth}>
        <App queryClient={queryClient} />
      </AuthProvider>
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  document.getElementById('root')!.textContent = 'GrowerCare could not start. Please reload the page.';
  console.error(error);
});
