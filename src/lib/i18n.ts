import { translationsPt } from '@/lib/translations/pt';
import { translationsEn } from '@/lib/translations/en';
import { translationsEs } from '@/lib/translations/es';
import { translationsDe } from '@/lib/translations/de';
import { translationsFr } from '@/lib/translations/fr';

export const defaultLocale = 'pt';
export const locales = ['pt', 'en', 'es', 'de', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: 'PT',
  en: 'EN',
  es: 'ES',
  de: 'DE',
  fr: 'FR',
};

export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  pt: 'pt-PT',
  en: 'en',
  es: 'es',
  de: 'de',
  fr: 'fr',
};

export const LOCALE_OG: Record<Locale, string> = {
  pt: 'pt_PT',
  en: 'en_US',
  es: 'es_ES',
  de: 'de_DE',
  fr: 'fr_FR',
};

/** Regex that matches a leading locale segment, e.g. `/pt` or `/es/`. */
export const localePathPattern = new RegExp(`^/(${locales.join('|')})(?=/|$)`);

export function isValidLocale(locale: string): locale is Locale {
  return (locales as readonly string[]).includes(locale);
}

export function validateLocale(locale: string): Locale {
  return isValidLocale(locale) ? locale : defaultLocale;
}

/** Pick a value for the active locale; fall back en → pt. */
export function pickLocale<T>(
  locale: string,
  map: Partial<Record<Locale, T>> & { pt: T; en: T },
): T {
  const loc = validateLocale(locale);
  if (map[loc] !== undefined) return map[loc] as T;
  if (map.en !== undefined) return map.en;
  return map.pt;
}

/** Resolve preferred locale from storage / navigator.language. */
export function resolvePreferredLocale(
  stored: string | null | undefined,
  navLang: string | null | undefined,
): Locale {
  const candidates = [stored, navLang].filter((v): v is string => !!v && v.trim().length > 0);
  if (candidates.length === 0) return defaultLocale;
  for (const raw of candidates) {
    const lower = raw.toLowerCase().trim();
    if (isValidLocale(lower)) return lower;
    const prefix = lower.slice(0, 2);
    if (isValidLocale(prefix)) return prefix;
  }
  return 'en';
}

export function pathForLocale(pathname: string, fromLocale: string, toLocale: Locale): string {
  return (
    (pathname || '/').replace(new RegExp(`^/${fromLocale}(?=/|$)`), `/${toLocale}`) ||
    `/${toLocale}/`
  );
}

export const translations = {
  pt: translationsPt,
  en: translationsEn,
  es: translationsEs,
  de: translationsDe,
  fr: translationsFr,
};

export function getTranslation(locale: string): (typeof translations)['pt'] {
  // Shell keys exist for es/de/fr; many page UIs still branch isPt→EN (SEO MVP).
  const loc = validateLocale(locale);
  const block = translations[loc as keyof typeof translations];
  return (block ?? translations.en ?? translations.pt) as (typeof translations)['pt'];
}
