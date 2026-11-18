import { ApiError } from '@gc/api-client';
import { expectAccessible, renderWithProviders } from '@gc/test-utils';
import { useLanguage } from '@gc/i18n';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { ErrorView, errorKind } from './ErrorView';
import { uiKitMessages } from './messages';

const api = (status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, requestId: 'r-1', ...extra });

describe('SPEC-FE-01 R5 every error explained, never a blank screen', () => {
  it.each([
    ['FE-E5 401', api(401), 'Your session has ended'],
    ['FE-E5 403', api(403), "You can't do this"],
    ['FE-E5 412', api(412), 'Someone else changed this'],
    ['FE-E5 422 with the rule', api(422, { detail: 'A closed case cannot change' }), 'A closed case cannot change'],
    ['FE-E5 400 with fields', api(400, { errors: [{ field: 'phone', message: 'invalid' }] }), 'phone: invalid'],
    ['FE-E5 429 with the wait', api(429, { retryAfterSeconds: 30 }), 'Try again in 30 seconds'],
    ['FE-E5 503', api(503), "can't reach the service"],
    ['FE-E5 network', api(0), "can't reach the service"],
    ['FE-E5 anything else', new Error('boom'), 'Something went wrong'],
  ])('%s', async (_name, error, text) => {
    const { container } = renderWithProviders(<ErrorView error={error} onRetry={() => undefined} onReload={() => undefined} />, { catalogs: [uiKitMessages] });
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('FE-E5 404 is the not-found page, for missing and out of scope alike', () => {
    renderWithProviders(<ErrorView error={api(404)} />, { catalogs: [uiKitMessages] });
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(errorKind(api(404))).toBe('notFound');
  });

  it('FE-E5 retry and reload call back', async () => {
    const retry = vi.fn();
    const reload = vi.fn();
    renderWithProviders(<><ErrorView error={api(503)} onRetry={retry} /><ErrorView error={api(412)} onReload={reload} /></>, { catalogs: [uiKitMessages] });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('SPEC-FE-01 R8/R9 the shell', () => {
  it('FE-E9 switching to Marathi changes every string and is remembered', async () => {
    renderWithProviders(<AppShell title="GrowerCare" userName="+919876543210" onSignOut={() => undefined}><p>body</p></AppShell>, { catalogs: [uiKitMessages] });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'mr');
    expect(screen.getByRole('button', { name: 'साइन आउट' })).toBeInTheDocument();
    expect(useLanguage.getState().language).toBe('mr');
    expect(window.localStorage.getItem('gc.language')).toBe('mr');
    expect(document.documentElement.lang).toBe('mr');
  });

  it('FE-E8 sign out calls back; the shell is accessible', async () => {
    const signOut = vi.fn();
    const { container } = renderWithProviders(<AppShell title="GrowerCare" userName={null} onSignOut={signOut} nav={<a href="/">Home</a>}><p>body</p></AppShell>, { catalogs: [uiKitMessages] });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
    await expectAccessible(container);
  });
});
