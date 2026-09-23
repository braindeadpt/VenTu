import { getTranslation } from '@/lib/i18n';
import { DATE_LOCALE } from '@/lib/dataFreshness';

/** User-facing forecast layers shown in the hero ticker (trust / provenance). */
export const HERO_FORECAST_LAYERS = [
  { key: 'waves', source: 'Open-Meteo' },
  { key: 'wind', source: 'Open-Meteo' },
  { key: 'tides', source: 'Open-Meteo' },
] as const;

export const HERO_PIPELINE_CADENCE_HOURS = 2;

export function getHeroCadenceLabel(locale: string): string {
  return getTranslation(locale).homepage.heroCadence;
}

export function getHeroCadenceTitle(locale: string): string {
  return getTranslation(locale).homepage.heroCadenceTitle;
}

export function getHeroFreshnessTitle(locale: string, updatedAtTs: number): string {
  const loc = DATE_LOCALE[locale] ?? 'en-GB';
  const when = new Intl.DateTimeFormat(loc, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(updatedAtTs));

  return getTranslation(locale).homepage.heroFreshnessTitle.replace('{when}', when);
}
