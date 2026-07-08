import type { TideHourPoint } from '@/lib/tideSchedule';
import { findTideExtrema } from '@/lib/tideSchedule';

/** Lisbon calendar day YYYY-MM-DD from a Date. */
export function lisbonDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Daily tidal range (max − min MSL metres) from the same hourly curve as TideScheduleStrip.
 * Returns null when heights are missing or range is negligible.
 */
export function dailyTideAmplitudeMetres(
  hourly: TideHourPoint[],
  day: Date = new Date(),
): number | null {
  const key = lisbonDateKey(day);
  const heights = hourly
    .filter((p) => p.time.startsWith(key) && typeof p.tideHeight === 'number')
    .map((p) => p.tideHeight as number);

  if (heights.length < 2) return null;

  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const range = max - min;
  return range >= 0.08 ? Math.round(range * 10) / 10 : null;
}

/** First upcoming low tide from hourly MSL (for dawn patrol digest). */
export function findFirstLowTide(
  hourly: TideHourPoint[],
  now: Date = new Date(),
): Date | null {
  const extrema = findTideExtrema(hourly);
  const nowMs = now.getTime();
  const next = extrema.find((e) => e.type === 'low' && e.at.getTime() > nowMs);
  return next?.at ?? null;
}
