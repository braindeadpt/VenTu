import type { TideHourPoint } from '@/lib/tideSchedule';
import { findTideExtrema } from '@/lib/tideSchedule';
import { LISBON_TZ } from '@/lib/spotTimeZone';
import { dateKeyInTz } from '@/lib/openMeteoTime';

export { dateKeyInTz };

/** @deprecated alias — Lisbon calendar day (pipeline/homepage callers). */
export function lisbonDateKey(date: Date): string {
  return dateKeyInTz(date, LISBON_TZ);
}

/**
 * Daily tidal range (max − min MSL metres) from the same hourly curve as TideScheduleStrip.
 * `timeZone` = fuso das `time` (o do spot) — o dia civil é o local do spot.
 * Returns null when heights are missing or range is negligible.
 */
export function dailyTideAmplitudeMetres(
  hourly: TideHourPoint[],
  day: Date = new Date(),
  timeZone: string = LISBON_TZ,
): number | null {
  const key = dateKeyInTz(day, timeZone);
  const heights = hourly
    .filter((p) => p.time.startsWith(key) && typeof p.tideHeight === 'number')
    .map((p) => p.tideHeight as number);

  if (heights.length < 2) return null;

  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const range = max - min;
  return range >= 0.08 ? Math.round(range * 10) / 10 : null;
}

/** First upcoming low tide from hourly MSL (for dawn patrol digest).
 *  `timeZone` = fuso das `time` (o do spot); o `Date` devolvido é um
 *  instante real nesse fuso. */
export function findFirstLowTide(
  hourly: TideHourPoint[],
  now: Date = new Date(),
  timeZone: string = LISBON_TZ,
): Date | null {
  const extrema = findTideExtrema(hourly, timeZone);
  const nowMs = now.getTime();
  const next = extrema.find((e) => e.type === 'low' && e.at.getTime() > nowMs);
  return next?.at ?? null;
}
