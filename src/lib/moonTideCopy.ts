import { formatTideTime } from '@/lib/tideSchedule';
import {
  getMoonPhase,
  getMoonPhaseLabels,
  getTideRegimeLabels,
} from '@/lib/moonPhase';
import { LISBON_TZ } from '@/lib/spotTimeZone';

/** One-line digest for Dawn Patrol (phase · regime · first low).
 *  `timeZone` = fuso do spot de onde `firstLow` veio. */
export function buildDawnPatrolMoonLine(
  locale: 'pt' | 'en',
  date: Date,
  firstLow: Date | null,
  timeZone: string = LISBON_TZ,
): string {
  const moon = getMoonPhase(date);
  const phase = getMoonPhaseLabels(locale)[moon.name];
  const regime = getTideRegimeLabels(locale)[moon.tideRegime];

  if (firstLow) {
    const time = formatTideTime(firstLow, locale, timeZone);
    return locale === 'pt'
      ? `${phase} · ${regime} · baixa-mar ${time}`
      : `${phase} · ${regime} · low tide ${time}`;
  }

  return `${phase} · ${regime}`;
}
