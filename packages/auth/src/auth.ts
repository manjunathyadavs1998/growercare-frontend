import { InMemoryWebStorage, UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';

/**
 * SPEC-FE-01 D3 / R1–R4 / R8: Authorization Code + PKCE against Keycloak with oidc-client-ts.
 * - Tokens live in memory only (R2): the user store is an InMemoryWebStorage. Only the short-lived PKCE/state record
 *   of a redirect in flight goes to sessionStorage (it holds no token and is deleted when the redirect completes).
 * - After a reload there is no user in memory: the app redirects to Keycloak with prompt=none, which signs in
 *   without a form while the Keycloak session lives (R3); if it does not, the normal login follows.
 * - Access tokens are renewed in the background with the rotating refresh token (R4); when that fails, the user signs
 *   in again and comes back to the same route.
 */

export interface AuthConfig {
  authority: string;
  clientId: string;
}

export const CALLBACK_PATH = '/auth/callback';

/** The part of oidc-client-ts' UserManager the app uses (a fake replaces it in tests). */
export interface OidcPort {
  signinRedirect(args: { prompt?: string; state: AppState }): Promise<void>;
  signinRedirectCallback(url: string): Promise<{ access_token: string; expired?: boolean; state?: unknown; profile?: Record<string, unknown> }>;
  signoutRedirect(): Promise<void>;
  removeUser(): Promise<void>;
  onUserLoaded(listener: (user: { access_token: string; profile?: Record<string, unknown> }) => void): void;
  onSilentRenewError(listener: (error: Error) => void): void;
}

export interface AppState {
  returnTo: string;
}

/** Where the browser is and how to move it (window.location / history in the app; a stub in tests). */
export interface Navigator {
  href(): string;
  pathname(): string;
  search(): string;
  replace(path: string): void;
}

export interface AuthClient {
  /** 'signed-in' when the app may render; 'redirecting' when the browser is on its way to Keycloak. */
  start(): Promise<'signed-in' | 'redirecting'>;
  accessToken(): string | null;
  /** Display name from the ID token (the phone number for growers). */
  userName(): string | null;
  /**
   * True while the access token has more than 30 s left. Every 401 from the services carries the same code, so a 401
   * with a still-valid token means "no GrowerCare account yet" (SPEC-FE-02 R100), not "sign in again".
   */
  tokenStillValid(now?: number): boolean;
  signIn(returnTo?: string): Promise<void>;
  signOut(): Promise<void>;
}

const NO_SESSION = new Set(['login_required', 'interaction_required', 'consent_required', 'account_selection_required']);

export function userManagerSettings(config: AuthConfig, origin: string): UserManagerSettings {
  return {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/`,
    response_type: 'code',
    scope: 'openid',
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage, prefix: 'gc.oidc.' }),
    automaticSilentRenew: true,
    loadUserInfo: false,
  };
}

export function oidcPort(manager: UserManager): OidcPort {
  return {
    signinRedirect: (args) => manager.signinRedirect(args),
    signinRedirectCallback: (url) => manager.signinRedirectCallback(url),
    signoutRedirect: () => manager.signoutRedirect(),
    removeUser: () => manager.removeUser(),
    onUserLoaded: (listener) => manager.events.addUserLoaded(listener),
    onSilentRenewError: (listener) => manager.events.addSilentRenewError(listener),
  };
}

export function browserNavigator(): Navigator {
  return {
    href: () => window.location.href,
    pathname: () => window.location.pathname,
    search: () => window.location.search,
    replace: (path) => window.history.replaceState(null, '', path),
  };
}

/** Path and query only: the fragment never matters to the app and may carry OIDC leftovers. */
function currentRoute(nav: Navigator): string {
  return nav.pathname() === CALLBACK_PATH ? '/' : `${nav.pathname()}${nav.search()}`;
}

function isAppState(value: unknown): value is AppState {
  return typeof value === 'object' && value !== null && typeof (value as AppState).returnTo === 'string'
    && (value as AppState).returnTo.startsWith('/') && !(value as AppState).returnTo.startsWith('//');
}

/** The exp claim of a JWT (seconds), read without verifying: only the servers trust tokens. */
export function expiry(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export function createAuth(oidc: OidcPort, nav: Navigator): AuthClient {
  let token: string | null = null;
  let name: string | null = null;

  const remember = (user: { access_token: string; profile?: Record<string, unknown> }) => {
    token = user.access_token;
    const profile = user.profile ?? {};
    name = (profile.name as string | undefined) ?? (profile.preferred_username as string | undefined) ?? null;
  };
  oidc.onUserLoaded(remember);

  const signIn = (returnTo = currentRoute(nav)) => oidc.signinRedirect({ state: { returnTo } });
  oidc.onSilentRenewError(() => {
    token = null;
    void signIn();
  });

  return {
    async start() {
      if (nav.pathname() === CALLBACK_PATH) {
        try {
          const user = await oidc.signinRedirectCallback(nav.href());
          remember(user);
          nav.replace(isAppState(user.state) ? user.state.returnTo : '/');
          return 'signed-in';
        } catch (error) {
          const code = (error as { error?: string }).error;
          const state = (error as { state?: unknown }).state;
          const returnTo = isAppState(state) ? state.returnTo : '/';
          // the silent attempt found no Keycloak session: show the login form, keep the route
          await oidc.signinRedirect({ state: { returnTo } });
          if (code !== undefined && !NO_SESSION.has(code)) console.warn('sign-in failed:', code);
          return 'redirecting';
        }
      }
      await oidc.signinRedirect({ prompt: 'none', state: { returnTo: currentRoute(nav) } });
      return 'redirecting';
    },
    accessToken: () => token,
    tokenStillValid: (now = Date.now()) => {
      const exp = token === null ? null : expiry(token);
      return exp !== null && exp * 1000 - now > 30_000;
    },
    userName: () => name,
    signIn,
    async signOut() {
      token = null;
      name = null;
      await oidc.removeUser();
      await oidc.signoutRedirect();
    },
  };
}
