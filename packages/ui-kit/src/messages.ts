import type { Catalogs } from '@gc/i18n';
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import mr from './i18n/mr.json';

/** ui-kit's own strings; apps merge them with theirs (mergeCatalogs). */
export const uiKitMessages: Catalogs = { en, hi, mr };
