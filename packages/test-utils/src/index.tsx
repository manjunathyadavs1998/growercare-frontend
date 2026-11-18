import { mergeCatalogs, I18nProvider, useLanguage, type Catalogs, type Language } from '@gc/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { expect } from 'vitest';

export { server } from './server';

export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

/** Renders inside the app's providers: React Query (no retries), FormatJS with the given catalogues, a memory router. */
export function renderWithProviders(ui: ReactElement, options: { catalogs: Catalogs[]; route?: string; language?: Language; client?: QueryClient } ): RenderResult & { client: QueryClient } {
  useLanguage.setState({ language: options.language ?? 'en' });
  const client = options.client ?? testQueryClient();
  const result = render(
    <QueryClientProvider client={client}>
      <I18nProvider catalogs={mergeCatalogs(...options.catalogs)}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

/** PRD §7 / FE-01 D9: no serious or critical axe violation in what is on screen. */
export async function expectAccessible(container: Element): Promise<void> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
export { fakeAuth, renderRoutes } from './routes';
