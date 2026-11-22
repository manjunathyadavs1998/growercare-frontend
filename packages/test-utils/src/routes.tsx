import { AuthProvider, type AuthClient } from '@gc/auth';
import { I18nProvider, mergeCatalogs, useLanguage, type Catalogs, type Language } from '@gc/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router';
import { vi } from 'vitest';

/** A signed-in session as the app sees it (no Keycloak). The display name and the username differ when the user gave a name. */
export function fakeAuth(userName = '+919876543210', loginName = '+919876543210') {
  return {
    start: async () => 'signed-in' as const,
    accessToken: () => 'test-token',
    userName: () => userName,
    loginName: () => loginName,
    tokenStillValid: () => true,
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  } satisfies AuthClient;
}

/** Renders an app's real route table at {@code route}, inside its providers. */
export function renderRoutes(
  routes: RouteObject[],
  options: { catalogs: Catalogs[]; route?: string; language?: Language; user?: { userName: string; loginName: string } },
) {
  useLanguage.setState({ language: options.language ?? 'en' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [options.route ?? '/'] });
  const auth = options.user ? fakeAuth(options.user.userName, options.user.loginName) : fakeAuth();
  const result = render(
    <QueryClientProvider client={client}>
      <I18nProvider catalogs={mergeCatalogs(...options.catalogs)}>
        <AuthProvider client={auth}>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { ...result, client, router, auth };
}
