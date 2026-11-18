import type { Catalogs } from '@gc/i18n';
import { mergeCatalogs } from '@gc/i18n';
import { uiKitMessages } from '@gc/ui-kit';
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import mr from './i18n/mr.json';

export const appMessages: Catalogs = { en, hi, mr };
export const messages: Catalogs = mergeCatalogs(uiKitMessages, appMessages);
