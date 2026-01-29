import type { Language } from '@/lib/types';

// Import dictionaries
const dictionaries = {
  en: () => import('./dictionaries/en.json').then((module) => module.default),
  si: () => import('./dictionaries/si.json').then((module) => module.default),
};

export type Dictionary = Awaited<ReturnType<typeof getDictionary>>;

export async function getDictionary(locale: Language) {
  return dictionaries[locale]();
}

export const defaultLocale: Language = 'en';
export const locales: Language[] = ['en', 'si'];
