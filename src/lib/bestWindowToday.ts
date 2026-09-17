import { computeMagicWindows, type HourlyCondition } from '@/lib/magicWindows';
import { getCompatibleSports } from '@/lib/sportRatings';
import type { SportType } from '@/lib/sportRatings';
import { getHourlyScores, type Conditions } from '@/lib/sportScore';
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

/**
 * Upcoming magic window on the canonical score scale — the same scorer the
 * forecast table and spot-page windows use, so a home «Próximas janelas»
 * row can never disagree with the spot page. Unlike `BestWindowToday`
 * (heuristic + hour-of-day), this carries the ISO timestamps needed to
 * label «Hoje»/«Amanhã»/weekday against the reader's clock.
 */
export interface UpcomingWindow {
  /** ISO forecast timestamp of the window start. */
  startIso: string;
  /** ISO forecast timestamp of the window end (last good hour). */
  endIso: string;
  score: number;
}

export type UpcomingWindowsBySport = Partial<Record<SportType, UpcomingWindow>>;

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

/** Next `hours` of hourly forecast — same filter as SpotDetailClient magic windows. */
function filterForecastNextHours(
  forecast: ForecastHourRow[],
  hours: number,
  nowMs: number,
): HourlyCondition[] {
  const cutoff = nowMs + hours * HOUR_MS;
  return forecast
    .map(toHourly)
    .filter((h) => {
      const t = new Date(h.time).getTime();
      return t >= nowMs && t < cutoff;
    });
}

/** Next 24h of hourly forecast — same filter as SpotDetailClient magic windows. */
export function filterForecastNext24h(
  forecast: ForecastHourRow[],
  nowMs = Date.now(),
): HourlyCondition[] {
  return filterForecastNextHours(forecast, 24, nowMs);
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

/**
 * Best upcoming window per compatible sport over the next 48h, scored with
 * the canonical hourly scorer (`getHourlyScores` + `computeMagicWindows`
 * `scores` path — the spot page's own chain). Baked at SSG from the same
 * build-time clock as `computeBestWindowsForSpot`; the UI drops rows whose
 * `endIso` has passed on the reader's clock after mount.
 */
export function computeUpcomingWindowsForSpot(
  spot: Spot,
  forecast: ForecastHourRow[],
  currentConditions: Conditions,
  nowMs = Date.now(),
): UpcomingWindowsBySport {
  const hourly = filterForecastNextHours(forecast, 48, nowMs);
  const out: UpcomingWindowsBySport = {};
  if (!hourly.length) return out;

  for (const sport of getCompatibleSports(spot)) {
    const scores = getHourlyScores(spot, sport, hourly, currentConditions);
    const top = computeMagicWindows(hourly, sport, spot.bestWind || '', scores)[0];
    if (!top) continue;
    const startRow = hourly[top.start];
    const endRow = hourly[top.end];
    if (!startRow || !endRow) continue;
    out[sport] = { startIso: startRow.time, endIso: endRow.time, score: top.score };
  }

  return out;
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
