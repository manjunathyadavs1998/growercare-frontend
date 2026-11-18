import { LANGUAGES, LANGUAGE_NAMES, useLanguage, type Language } from '@gc/i18n';
import type { ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from './Button';

/** The frame of every screen: app name, language switch (R9), who is signed in and sign out (R8). */
export function AppShell({ title, userName, onSignOut, nav, children }: {
  title: string; userName: string | null; onSignOut: () => void; nav?: ReactNode; children: ReactNode;
}) {
  const intl = useIntl();
  const { language, setLanguage } = useLanguage();
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="me-auto text-lg font-semibold text-emerald-800">{title}</span>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only"><FormattedMessage id="shell.language" /></span>
          <select
            aria-label={intl.formatMessage({ id: 'shell.language' })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((l) => <option key={l} value={l} lang={l}>{LANGUAGE_NAMES[l]}</option>)}
          </select>
        </label>
        {userName ? <span className="text-sm text-slate-600">{userName}</span> : null}
        <Button variant="secondary" onClick={onSignOut}><FormattedMessage id="shell.signOut" /></Button>
      </header>
      {nav ? <nav aria-label={intl.formatMessage({ id: 'shell.navigation' })} className="border-b border-slate-200 bg-white px-4">{nav}</nav> : null}
      <main className="mx-auto w-full max-w-5xl p-4">{children}</main>
    </div>
  );
}
