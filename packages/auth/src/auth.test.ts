import { InMemoryWebStorage } from 'oidc-client-ts';
import { describe, expect, it, vi } from 'vitest';
import { CALLBACK_PATH, createAuth, userManagerSettings, type AppState, type Navigator, type OidcPort } from './auth';

/** A fake Keycloak client: records redirects, lets a test fire the library's events. */
function fakeOidc(callback: () => Promise<{ access_token: string; state?: unknown; profile?: Record<string, unknown> }>) {
  const listeners: { loaded: ((u: { access_token: string }) => void)[]; renewError: ((e: Error) => void)[] } = { loaded: [], renewError: [] };
  const port = {
    signinRedirect: vi.fn<(args: { prompt?: string; state: AppState }) => Promise<void>>().mockResolvedValue(undefined),
    signinRedirectCallback: vi.fn(callback),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
    removeUser: vi.fn().mockResolvedValue(undefined),
    onUserLoaded: (l: (u: { access_token: string }) => void) => listeners.loaded.push(l),
    onSilentRenewError: (l: (e: Error) => void) => listeners.renewError.push(l),
  } satisfies OidcPort;
  return { port, listeners };
}

function at(path: string, search = ''): Navigator & { replaced: string[] } {
  const replaced: string[] = [];
  return { href: () => `http://localhost:5173${path}${search}`, pathname: () => path, search: () => search, replace: (p) => replaced.push(p), replaced };
}

describe('SPEC-FE-01 sign-in', () => {
  it('FE-E1 a signed-out visit goes to Keycloak and comes back to the same route (path and query only)', async () => {
    const { port } = fakeOidc(async () => ({ access_token: 'a' }));
    const auth = createAuth(port, at('/cases/123', '?tab=comments'));
    expect(await auth.start()).toBe('redirecting');
    expect(port.signinRedirect).toHaveBeenCalledWith({ prompt: 'none', state: { returnTo: '/cases/123?tab=comments' } });

    const back = fakeOidc(async () => ({ access_token: 'token-1', state: { returnTo: '/cases/123?tab=comments' } }));
    const nav = at(CALLBACK_PATH, '?code=x&state=y');
    const signedIn = createAuth(back.port, nav);
    expect(await signedIn.start()).toBe('signed-in');
    expect(nav.replaced).toEqual(['/cases/123?tab=comments']);
    expect(signedIn.accessToken()).toBe('token-1');
  });

  it('FE-E1 a returnTo that is not a local path is ignored (no open redirect)', async () => {
    const { port } = fakeOidc(async () => ({ access_token: 't', state: { returnTo: '//evil.test/x' } }));
    const nav = at(CALLBACK_PATH);
    await createAuth(port, nav).start();
    expect(nav.replaced).toEqual(['/']);
  });

  it('FE-E2 tokens are kept in memory only; just the redirect state uses sessionStorage', () => {
    const settings = userManagerSettings({ authority: 'http://kc/realms/growercare', clientId: 'grower-web' }, 'http://localhost:5173');
    const userStore = settings.userStore as unknown as { _store: unknown };
    expect(userStore._store).toBeInstanceOf(InMemoryWebStorage);
    expect(settings.redirect_uri).toBe(`http://localhost:5173${CALLBACK_PATH}`);
    expect(settings.response_type).toBe('code');
    expect(localStorage.length).toBe(0);
  });

  it('FE-E3 a reload tries the Keycloak session silently (prompt=none) before any login form', async () => {
    const { port } = fakeOidc(async () => ({ access_token: 'a' }));
    await createAuth(port, at('/')).start();
    expect(port.signinRedirect).toHaveBeenCalledTimes(1);
    expect(port.signinRedirect.mock.calls[0]?.[0].prompt).toBe('none');
  });

  it('FE-E3 no Keycloak session: the login form follows, keeping the route', async () => {
    const { port } = fakeOidc(async () => {
      throw Object.assign(new Error('login_required'), { error: 'login_required', state: { returnTo: '/farms' } });
    });
    expect(await createAuth(port, at(CALLBACK_PATH)).start()).toBe('redirecting');
    expect(port.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/farms' } });
  });

  it('FE-E4 a token renewed in the background replaces the old one; a failed renewal signs in again on the same route', async () => {
    const { port, listeners } = fakeOidc(async () => ({ access_token: 'old', state: { returnTo: '/' } }));
    const nav = at(CALLBACK_PATH);
    const auth = createAuth(port, nav);
    await auth.start();
    listeners.loaded.forEach((l) => l({ access_token: 'new' }));
    expect(auth.accessToken()).toBe('new');

  });

  it('FE-E4 a failed renewal forgets the token and signs in again on the same route', async () => {
    const { port, listeners } = fakeOidc(async () => ({ access_token: 'x' }));
    const auth = createAuth(port, at('/cases', '?status=OPEN'));
    listeners.loaded.forEach((l) => l({ access_token: 'old' }));
    listeners.renewError.forEach((l) => l(new Error('invalid_grant')));
    expect(auth.accessToken()).toBeNull();
    expect(port.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/cases?status=OPEN' } });
  });

  it('FE-E8 signing out forgets the token and ends the Keycloak session', async () => {
    const { port } = fakeOidc(async () => ({ access_token: 't', profile: { preferred_username: '+919876543210' } }));
    const auth = createAuth(port, at(CALLBACK_PATH));
    await auth.start();
    expect(auth.userName()).toBe('+919876543210');
    await auth.signOut();
    expect(auth.accessToken()).toBeNull();
    expect(auth.userName()).toBeNull();
    expect(port.removeUser).toHaveBeenCalled();
    expect(port.signoutRedirect).toHaveBeenCalled();
  });
});
