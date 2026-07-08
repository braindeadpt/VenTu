import { formatTideTime } from '@/lib/tideSchedule';
import {
  getMoonPhase,
  getMoonPhaseLabels,
  getTideRegimeLabels,
} from '@/lib/moonPhase';

/** One-line digest for Dawn Patrol (phase · regime · first low). */
export function buildDawnPatrolMoonLine(
  locale: 'pt' | 'en',
  date: Date,
  firstLow: Date | null,
): string {
  const moon = getMoonPhase(date);
  const phase = getMoonPhaseLabels(locale)[moon.name];
  const regime = getTideRegimeLabels(locale)[moon.tideRegime];

  if (firstLow) {
    const time = formatTideTime(firstLow, locale);
    return locale === 'pt'
      ? `${phase} · ${regime} · baixa-mar ${time}`
      : `${phase} · ${regime} · low tide ${time}`;
  }

  return `${phase} · ${regime}`;
}
