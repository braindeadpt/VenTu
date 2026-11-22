import { formatTideTime } from '@/lib/tideSchedule';
import {
  getMoonPhase,
  getMoonPhaseLabels,
  getTideRegimeLabels,
} from '@/lib/moonPhase';
import { pickLocale } from '@/lib/i18n';
import { libDawnMoonLine } from '@/lib/translations/lib';

/** One-line digest for Dawn Patrol (phase · regime · first low). */
export function buildDawnPatrolMoonLine(
  locale: string,
  date: Date,
  firstLow: Date | null,
): string {
  const moon = getMoonPhase(date);
  const phase = getMoonPhaseLabels(locale)[moon.name];
  const regime = getTideRegimeLabels(locale)[moon.tideRegime];

  if (firstLow) {
    const time = formatTideTime(firstLow, locale);
    return pickLocale(locale, libDawnMoonLine)
      .replace('{phase}', phase)
      .replace('{regime}', regime)
      .replace('{time}', time);
  }

  return `${phase} · ${regime}`;
}
