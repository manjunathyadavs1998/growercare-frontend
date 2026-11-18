import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../messages';
import { routes } from '../routes';

const ME = 'http://localhost/api/iam/me';
const grower = { userId: '1', userType: 'GROWER', homeCountry: 'IN', grants: [{ roleCode: 'GROWER', permissions: ['case:read', 'case:create'] }] };

describe('SPEC-FE-01 grower-web shell', () => {
  it('a signed-in grower sees the home page, in English and accessibly', async () => {
    server.use(http.get(ME, () => HttpResponse.json(grower)));
    const { container } = renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText('You are signed in (IN).')).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('SPEC-FE-02 R100 a fresh sign-in without an account is told the account comes next (no sign-in loop)', async () => {
    server.use(http.get(ME, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    const { auth } = renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText(/not set up yet/)).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('FE-E5 IAM down: a retry banner, the shell still works', async () => {
    server.use(http.get(ME, () => HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('FE-E8 sign out clears the cache and ends the session', async () => {
    server.use(http.get(ME, () => HttpResponse.json(grower)));
    const { auth, client } = renderRoutes(routes, { catalogs: [messages] });
    await screen.findByText('You are signed in (IN).');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('FE-E9 the app in Marathi', async () => {
    server.use(http.get(ME, () => HttpResponse.json(grower)));
    renderRoutes(routes, { catalogs: [messages], language: 'mr' });
    expect(await screen.findByRole('heading', { name: 'ग्रोअरकेअरमध्ये आपले स्वागत आहे' })).toBeInTheDocument();
  });

  it('an unknown route is the not-found page', async () => {
    server.use(http.get(ME, () => HttpResponse.json(grower)));
    renderRoutes(routes, { catalogs: [messages], route: '/no/such/page' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });
});
