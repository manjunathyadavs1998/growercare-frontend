import { describe, expect, it } from 'vitest';
import { createAuth, expiry, type OidcPort } from './auth';
import { loadConfig } from './config';

const json = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

function jwt(exp: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'RS256' })}.${b64({ exp, sub: 'u' })}.sig`;
}

describe('SPEC-FE-01 D4 runtime configuration', () => {
  it('reads the three settings', async () => {
    const config = await loadConfig(json({ oidcAuthority: 'http://kc/realms/growercare', oidcClientId: 'grower-web', apiBase: '/api' }));
    expect(config.oidcClientId).toBe('grower-web');
  });

  it('names every missing setting', async () => {
    await expect(loadConfig(json({ apiBase: '/api' }))).rejects.toThrow('missing oidcAuthority, oidcClientId');
  });

  it('fails clearly without a config file', async () => {
    await expect(loadConfig(json({}, 404))).rejects.toThrow('HTTP 404');
  });
});

describe('SPEC-FE-02 R100 a 401 with a fresh token means "no account yet"', () => {
  const port = (token: string): OidcPort => ({
    signinRedirect: async () => undefined,
    signinRedirectCallback: async () => ({ access_token: token, state: { returnTo: '/' } }),
    signoutRedirect: async () => undefined,
    removeUser: async () => undefined,
    onUserLoaded: () => undefined,
    onSilentRenewError: () => undefined,
  });
  const nav = { href: () => 'http://x/auth/callback', pathname: () => '/auth/callback', search: () => '', replace: () => undefined };

  it.each([
    ['a token with 5 minutes left is still valid', 300, true],
    ['a token with 10 s left counts as expired', 10, false],
  ])('%s', async (_name, secondsLeft, valid) => {
    const now = Date.now();
    const auth = createAuth(port(jwt(Math.floor(now / 1000) + secondsLeft)), nav);
    await auth.start();
    expect(auth.tokenStillValid(now)).toBe(valid);
  });

  it('no token or a malformed one is never valid', () => {
    expect(createAuth(port('x'), nav).tokenStillValid()).toBe(false);
    expect(expiry('not-a-jwt')).toBeNull();
  });
});
