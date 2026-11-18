import { useEffect, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import { useLanguage, type Language } from './language';

export type Catalog = Record<string, string>;
export type Catalogs = Record<Language, Catalog>;

/** Merges catalogues (e.g. ui-kit's and the app's) per language. */
export function mergeCatalogs(...all: Catalogs[]): Catalogs {
  return {
    en: Object.assign({}, ...all.map((c) => c.en)),
    hi: Object.assign({}, ...all.map((c) => c.hi)),
    mr: Object.assign({}, ...all.map((c) => c.mr)),
  };
}

/** SPEC-FE-01 D7: FormatJS with the chosen language; a missing message is a CI failure (pnpm i18n:check), not a runtime fallback. */
export function I18nProvider({ catalogs, children }: { catalogs: Catalogs; children: ReactNode }) {
  const language = useLanguage((s) => s.language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <IntlProvider locale={language} defaultLocale="en" messages={catalogs[language]}>
      {children}
    </IntlProvider>
  );
}
