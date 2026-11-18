import { create } from 'zustand';

/** SPEC-FE-01 D7 / R9: the UI languages of Phase 1. */
export const LANGUAGES = ['en', 'hi', 'mr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };

const KEY = 'gc.language';

/** A UI preference, so browser storage is fine; it may be unavailable (private mode), which only means English. */
function stored(): Language {
  try {
    const value = window.localStorage.getItem(KEY);
    return (LANGUAGES as readonly string[]).includes(value ?? '') ? (value as Language) : 'en';
  } catch {
    return 'en';
  }
}

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguage = create<LanguageState>((set) => ({
  language: stored(),
  setLanguage: (language) => {
    try {
      window.localStorage.setItem(KEY, language);
    } catch {
      // not remembered across reloads; the UI still switches
    }
    document.documentElement.lang = language;
    set({ language });
  },
}));

/** For non-React code (the API fetcher's Accept-Language). */
export const currentLanguage = (): Language => useLanguage.getState().language;
