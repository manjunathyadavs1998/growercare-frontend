import '@testing-library/jest-dom/vitest';
import { configureApi } from '@gc/api-client';
import { currentLanguage } from '@gc/i18n';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server } from './server';

/** The signed-in test user's token and what a 401 did (reset before each test). */
export const testSession = { token: 'test-token' as string | null, unauthorized: 0 };

let mswFetch: typeof fetch;
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // jsdom's AbortSignal is not Node's, and Node's fetch rejects it (React Query passes one with every query). Test
  // environment only: browsers have a single AbortSignal. Requests in tests are never aborted, so the signal is dropped.
  mswFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => mswFetch(input, init ? { ...init, signal: undefined } : init);
});
beforeEach(() => {
  testSession.token = 'test-token';
  testSession.unauthorized = 0;
  configureApi({
    apiBase: 'http://localhost/api',
    getAccessToken: () => testSession.token,
    getLanguage: currentLanguage,
    onUnauthorized: () => { testSession.unauthorized += 1; },
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* storage unavailable */ }
});
afterAll(() => {
  globalThis.fetch = mswFetch;
  server.close();
});
