import type { Spot } from '@/types';
import { ALL_SPORTS, type GridSportFilter, type SportType } from '@/lib/sportRatings';
import { getAllSportScores } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import {
  findCurrentHourIndex,
  hourKeyFromOpenMeteo,
  lisbonHourKeyFromDate,
} from '@/lib/openMeteoTime';
import { getAssetPath } from '@/lib/paths';
import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';

export const MAP_HOURS_STEP = 3;
export const MAP_HOURS_COUNT = 16;
export const MAP_HOURS_PATH = '/data/map-hours.json';
/** Autoplay cadence for the 48 h score track (slower than radar's 1 s). */
export const MAP_HOURS_TICK_MS = 1500;
/** Hourly tide samples per macro-region (next extrema need ~1 h, not 3 h). */
export const MAP_TIDE_HOURS = 48;
export const MAP_TIDE_DEFAULT_REGION = 'Lisboa';

/** Deep link `?t=18` — hour of day in Lisbon (0–23). */
export function parseHourOfDayParam(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 23) return null;
  return n;
}

export interface MapTideCurve {
  spotId: string;
  times: string[];
  height: number[];
}

export interface MapHoursFile {
  generatedAt: string;
  stepHours: number;
  times: string[];
  sports: SportType[];
  spots: Record<string, Record<string, number[]>>;
  /** Optional: older caches / e2e stubs omit this; the HUD chip hides. */
  tides?: Record<string, MapTideCurve>;
}

export function pickMapHourTimes(
  times: string[],
  now = new Date(),
  step = MAP_HOURS_STEP,
  count = MAP_HOURS_COUNT,
): string[] {
  if (!times.length) return [];
  const start = findCurrentHourIndex(times, now);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = start + i * step;
    if (idx >= times.length) break;
    out.push(times[idx]);
  }
  return out;
}

export function pickMapTideHourTimes(
  times: string[],
  now = new Date(),
  count = MAP_TIDE_HOURS,
): string[] {
  if (!times.length) return [];
  const start = findCurrentHourIndex(times, now);
  return times.slice(start, start + count);
}

function forecastSeries(
  spot: Spot,
  forecasts: Record<string, Array<Record<string, unknown>>>,
): Array<Record<string, unknown>> {
  const own = forecasts[spot.id];
  if (Array.isArray(own) && own.length) return own;
  if (spot.conditionsSource && Array.isArray(forecasts[spot.conditionsSource])) {
    return forecasts[spot.conditionsSource];
  }
  return [];
}

function conditionsRow(
  spot: Spot,
  conditions: Record<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const own = conditions[spot.id];
  if (own && typeof own === 'object') return own;
  if (spot.conditionsSource) {
    const alias = conditions[spot.conditionsSource];
    if (alias && typeof alias === 'object') return alias;
  }
  return null;
}

function hourRowForTime(
  series: Array<Record<string, unknown>>,
  time: string,
): Record<string, unknown> | null {
  const key = hourKeyFromOpenMeteo(time);
  const hit = series.find((h) => hourKeyFromOpenMeteo(String(h.time ?? '')) === key);
  return hit ?? null;
}

function finiteTideHeight(row: Record<string, unknown> | null): number | null {
  if (!row) return null;
  const n = Number(row.tideHeight);
  return Number.isFinite(n) ? n : null;
}

function curveForSpot(
  spot: Spot,
  forecasts: Record<string, Array<Record<string, unknown>>>,
  hourlyTimes: string[],
): MapTideCurve | null {
  const series = forecastSeries(spot, forecasts);
  const times: string[] = [];
  const height: number[] = [];
  for (const time of hourlyTimes) {
    const h = finiteTideHeight(hourRowForTime(series, time));
    if (h === null) continue;
    times.push(time);
    height.push(h);
  }
  if (height.length < 24) return null;
  return { spotId: spot.id, times, height };
}

function buildMapTides(
  spots: Spot[],
  forecasts: Record<string, Array<Record<string, unknown>>>,
  now: Date,
): Record<string, MapTideCurve> | undefined {
  const sample = spots
    .map((s) => forecastSeries(s, forecasts))
    .find((series) => series.length > 0);
  const hourlyTimes = pickMapTideHourTimes(
    (sample ?? []).map((h) => String(h.time ?? '')),
    now,
  );
  if (hourlyTimes.length < 24) return undefined;

  const tides: Record<string, MapTideCurve> = {};
  for (const region of MACRO_REGIONS) {
    if (region === 'Todos') continue;
    let best: MapTideCurve | null = null;
    for (const spot of spots) {
      if (getMacroRegion(spot.region) !== region) continue;
      const curve = curveForSpot(spot, forecasts, hourlyTimes);
      if (!curve) continue;
      if (!best || curve.height.length > best.height.length) best = curve;
    }
    if (best) tides[region] = best;
  }
  return Object.keys(tides).length ? tides : undefined;
}

export function mapHoursClock(time: string): string {
  const hour = hourKeyFromOpenMeteo(time).slice(-2);
  return `${hour}h`;
}

/** Nearest step whose Lisbon hour-of-day matches `hour` (0–23). */
export function indexForHourOfDay(times: string[], hourOfDay: number): number {
  if (!times.length) return 0;
  const target = ((hourOfDay % 24) + 24) % 24;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const h = Number(hourKeyFromOpenMeteo(times[i]).slice(-2));
    if (!Number.isFinite(h)) continue;
    const diff = Math.min(Math.abs(h - target), 24 - Math.abs(h - target));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export function scoreAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  sport: GridSportFilter,
  index: number,
): number | undefined {
  if (!file) return undefined;
  const row = file.spots[spotId];
  if (!row) return undefined;
  const key = sport === 'all' ? 'best' : sport === 'big-wave' ? 'surf' : sport;
  const series = row[key];
  if (!series || index < 0 || index >= series.length) return undefined;
  const n = series[index];
  return Number.isFinite(n) ? n : undefined;
}

export function buildMapHoursFile(opts: {
  forecasts: Record<string, Array<Record<string, unknown>>>;
  conditions: Record<string, Record<string, unknown>>;
  spots: Spot[];
  generatedAt?: string;
  now?: Date;
}): MapHoursFile {
  const now = opts.now ?? new Date();
  const sample = opts.spots
    .map((s) => forecastSeries(s, opts.forecasts))
    .find((series) => series.length > 0);
  const times = pickMapHourTimes(
    (sample ?? []).map((h) => String(h.time ?? '')),
    now,
  );
  const nowKey = lisbonHourKeyFromDate(now);
  const spots: MapHoursFile['spots'] = {};

  for (const spot of opts.spots) {
    const series = forecastSeries(spot, opts.forecasts);
    const live = conditionsRow(spot, opts.conditions);
    const bySport: Record<string, number[]> = {};
    for (const sport of ALL_SPORTS) bySport[sport] = [];
    bySport.best = [];

    for (const time of times) {
      const isNow = hourKeyFromOpenMeteo(time) === nowKey;
      const raw = (isNow && live) || hourRowForTime(series, time) || live;
      if (!raw) {
        for (const sport of ALL_SPORTS) bySport[sport].push(0);
        bySport.best.push(0);
        continue;
      }
      const scores = getAllSportScores(spot, rawToScoreInput(raw));
      let best = 0;
      for (const sport of ALL_SPORTS) {
        const n = Math.max(0, Math.min(100, Math.round(scores[sport]?.score ?? 0)));
        bySport[sport].push(n);
        if (n > best) best = n;
      }
      bySport.best.push(best);
    }

    spots[spot.id] = bySport;
  }

  const tides = buildMapTides(opts.spots, opts.forecasts, now);

  return {
    generatedAt: opts.generatedAt ?? now.toISOString(),
    stepHours: MAP_HOURS_STEP,
    times,
    sports: [...ALL_SPORTS],
    spots,
    ...(tides ? { tides } : {}),
  };
}

function parseTides(raw: unknown): Record<string, MapTideCurve> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, MapTideCurve> = {};
  for (const [region, curve] of Object.entries(raw as Record<string, unknown>)) {
    if (!curve || typeof curve !== 'object' || Array.isArray(curve)) continue;
    const c = curve as { spotId?: unknown; times?: unknown; height?: unknown };
    if (typeof c.spotId !== 'string' || !Array.isArray(c.times) || !Array.isArray(c.height)) continue;
    if (c.times.length !== c.height.length || c.times.length < 2) continue;
    const times = c.times.map(String);
    const height = c.height.map(Number);
    if (height.some((n) => !Number.isFinite(n))) continue;
    out[region] = { spotId: c.spotId, times, height };
  }
  return Object.keys(out).length ? out : undefined;
}

export async function fetchMapHours(): Promise<MapHoursFile | null> {
  try {
    const res = await fetch(getAssetPath(MAP_HOURS_PATH));
    if (!res.ok) return null;
    const data = (await res.json()) as MapHoursFile;
    if (!Array.isArray(data.times) || data.times.length < 2) return null;
    if (!data.spots || typeof data.spots !== 'object') return null;
    const tides = parseTides(data.tides);
    return tides ? { ...data, tides } : { ...data, tides: undefined };
  } catch {
    return null;
  }
}
