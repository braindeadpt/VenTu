import { computeMagicWindows, type HourlyCondition } from '@/lib/magicWindows';
import { getCompatibleSports } from '@/lib/sportRatings';
import type { SportType } from '@/lib/sportRatings';
import type { Spot } from '@/types';

export interface BestWindowToday {
  /** Hour of day in Europe/Lisbon (from forecast timestamp). */
  start: number;
  end: number;
  score: number;
  sport: SportType;
}

export type BestWindowsBySport = Partial<
  Record<SportType, Pick<BestWindowToday, 'start' | 'end' | 'score'>>
>;

export interface ForecastHourRow {
  time: string;
  waveHeight?: number;
  wavePeriod?: number;
  windSpeed?: number;
  windDirection?: number;
  windGust?: number;
  waterTemp?: number;
}

const HOUR_MS = 3_600_000;

function toHourly(row: ForecastHourRow): HourlyCondition {
  return {
    time: row.time,
    waveHeight: row.waveHeight ?? 0,
    wavePeriod: row.wavePeriod ?? 0,
    windSpeed: row.windSpeed ?? 0,
    windDirection: row.windDirection ?? 0,
    windGust: row.windGust ?? 0,
    waterTemp: row.waterTemp ?? 0,
  };
}

/** Next 24h of hourly forecast — same filter as SpotDetailClient magic windows. */
export function filterForecastNext24h(
  forecast: ForecastHourRow[],
  nowMs = Date.now(),
): HourlyCondition[] {
  const cutoff = nowMs + 24 * HOUR_MS;
  return forecast
    .map(toHourly)
    .filter((h) => {
      const t = new Date(h.time).getTime();
      return t >= nowMs && t < cutoff;
    });
}

function hourFromForecastTime(iso: string): number {
  const h = iso.slice(11, 13);
  const parsed = Number(h);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pre-compute today's best magic window per compatible sport (rolling 24h).
 * Uses the same `computeMagicWindows` path as the spot detail page.
 */
export function computeBestWindowsForSpot(
  spot: Pick<Spot, 'compatibleSports' | 'bestWind' | 'type'>,
  forecast: ForecastHourRow[],
  nowMs = Date.now(),
): { bestWindowToday: BestWindowToday | null; bestWindowsBySport: BestWindowsBySport } {
  const hourly = filterForecastNext24h(forecast, nowMs);
  const bestWindowsBySport: BestWindowsBySport = {};
  let bestWindowToday: BestWindowToday | null = null;

  if (!hourly.length) {
    return { bestWindowToday: null, bestWindowsBySport };
  }

  const sports = getCompatibleSports(spot as Spot);

  for (const sport of sports) {
    const windows = computeMagicWindows(hourly, sport, spot.bestWind || '');
    const top = windows[0];
    if (!top) continue;

    const startRow = hourly[top.start];
    const endRow = hourly[top.end];
    if (!startRow || !endRow) continue;

    const slice = {
      start: hourFromForecastTime(startRow.time),
      end: hourFromForecastTime(endRow.time),
      score: top.score,
    };
    bestWindowsBySport[sport] = slice;

    if (!bestWindowToday || slice.score > bestWindowToday.score) {
      bestWindowToday = { ...slice, sport };
    }
  }

  return { bestWindowToday, bestWindowsBySport };
}

/** Resolve the best window for a sport filter (matches homepage / Your day). */
export function resolveBestWindowForSport(
  bestWindowToday: BestWindowToday | null | undefined,
  bestWindowsBySport: BestWindowsBySport | undefined,
  sport: SportType | 'all',
): BestWindowToday | null {
  if (sport !== 'all' && bestWindowsBySport?.[sport]) {
    const w = bestWindowsBySport[sport]!;
    return { ...w, sport };
  }
  return bestWindowToday ?? null;
}
