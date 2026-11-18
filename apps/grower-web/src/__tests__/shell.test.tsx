import { renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../messages';
import { routes } from '../routes';

const API = 'http://localhost/api';
const growerAccount = { userId: '1', userType: 'GROWER', homeCountry: 'IN', grants: [{ roleCode: 'GROWER', permissions: ['case:read', 'case:create'] }] };
const activeGrower = { growerId: '110165911145454593', status: 'ACTIVE', countryCode: 'IN', phoneLast4: '3210', version: 0 };

function activeGrowerWithCases(items: object[] = [], nextCursor?: string) {
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(growerAccount)),
    http.get(`${API}/grower/growers/me`, () => HttpResponse.json(activeGrower)),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items, nextCursor })),
  );
}

describe('SPEC-FE-01 grower-web shell', () => {
  it('FE-E5 IAM down: a retry banner, the shell still works', async () => {
    server.use(http.get(`${API}/iam/me`, () => HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('FE-E8 sign out clears the cache and ends the session', async () => {
    activeGrowerWithCases();
    const { auth, client } = renderRoutes(routes, { catalogs: [messages] });
    await screen.findByRole('heading', { name: 'My cases' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('FE-E9 the app in Marathi', async () => {
    activeGrowerWithCases();
    renderRoutes(routes, { catalogs: [messages], language: 'mr' });
    expect(await screen.findByRole('heading', { name: 'माझी प्रकरणे' })).toBeInTheDocument();
  });

  it('an unknown route is the not-found page', async () => {
    activeGrowerWithCases();
    renderRoutes(routes, { catalogs: [messages], route: '/no/such/page' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('a staff member is told this app is for growers', async () => {
    server.use(http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '101', userType: 'STAFF', grants: [] })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('alert')).toHaveTextContent('This app is for growers');
  });

  it('an inactive grower is told to contact support', async () => {
    server.use(
      http.get(`${API}/iam/me`, () => HttpResponse.json(growerAccount)),
      http.get(`${API}/grower/growers/me`, () => HttpResponse.json({ ...activeGrower, status: 'INACTIVE' })),
    );
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('alert')).toHaveTextContent('not active');
  });
});
