import type { GridSportFilter, SportType } from '@/lib/sportRatings';
import { findCurrentHourIndex, hourKeyFromOpenMeteo, lisbonHourKeyFromDate } from '@/lib/openMeteoTime';
import { getAssetPath } from '@/lib/paths';

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

/**
 * Deep link `?dia=1` (#273, vindo da home): dia relativo a hoje em Lisboa,
 * só 0 ou 1 (a régua da home cobre hoje e amanhã). Qualquer outro valor é
 * ignorado e o `?t=` fica com o comportamento de sempre.
 */
export function parseDayParam(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return n === 0 || n === 1 ? n : null;
}

export interface MapTideCurve {
  spotId: string;
  times: string[];
  height: number[];
}

/**
 * Série de uma modalidade: score 0–100 por passo. Surf, kitesurf, windsurf,
 * bodyboard e foil vêm do motor v6 (#218, PRs 2 e 6): nota × 10, inteira, e
 * `null` quando o v6 não dá nota (noite ou sem dados nessa hora). SUP e
 * wakeboard são sempre números (motor antigo). `best` (o «Todos») é o máximo
 * das v6 com nota — `null` quando estão todas de noite — ou, num spot sem
 * modalidade v6, o do SUP / wakeboard.
 */
export type MapHoursSeries = Array<number | null>;

export interface MapHoursFile {
  generatedAt: string;
  stepHours: number;
  times: string[];
  sports: SportType[];
  spots: Record<string, Record<string, MapHoursSeries>>;
  /** Optional: older caches / e2e stubs omit this; the HUD chip hides. */
  tides?: Record<string, MapTideCurve>;
  /** Optional: Hs (m) per spot, same length as `times`. Hs field overlay. */
  hs?: Record<string, number[]>;
  /** Optional: SST (°C) per spot — water-temp coastal ribbon. */
  sst?: Record<string, number[]>;
  /** Optional: 0 none / 1 sea breeze / 2 land breeze. HUD chip only. */
  thermal?: Record<string, number[]>;
  /** Optional: surface current (m/s + towards °) per spot. Currents field overlay. */
  currents?: Record<string, { spd: number[]; dir: number[] }>;
  /** Optional: wind (m/s + FROM °, meteorological) per spot. Wind field overlay. */
  wind?: Record<string, { spd: number[]; dir: number[] }>;
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

/** Horas desde a época de uma chave de parede «YYYY-MM-DDTHH» (sem fuso). */
function wallKeyHours(key: string): number {
  const [date, hour] = key.split('T');
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, Number(hour)) / 3_600_000;
}

/**
 * Frame mais próxima de `<hoje em Lisboa + dia>T<hora>` (#273: `?t=10&dia=1`
 * = amanhã às 10h). `times` são horas de parede de Lisboa em passos de 3 h.
 * Sem `dia`, quem chama usa `indexForHourOfDay` (inalterado).
 */
export function indexForDayHour(times: string[], day: number, hourOfDay: number, now = new Date()): number {
  if (!times.length) return 0;
  const today = lisbonHourKeyFromDate(now).slice(0, 10);
  const h = ((Math.trunc(hourOfDay) % 24) + 24) % 24;
  const target = wallKeyHours(`${today}T00`) + Math.trunc(day) * 24 + h;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const v = wallKeyHours(hourKeyFromOpenMeteo(times[i]));
    if (!Number.isFinite(v)) continue;
    const diff = Math.abs(v - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/**
 * Score 0–100 de um spot numa frame:
 * - número: o score dessa hora;
 * - `null`: o motor v6 não dá nota nessa hora (noite ou sem dados, D3 da
 *   auditoria #218) — NÃO é «sem ficheiro»: quem chama não deve cair no score
 *   ao vivo como se a hora não existisse;
 * - `undefined`: sem ficheiro, sem spot, sem série ou frame fora da série.
 */
export function scoreAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  sport: GridSportFilter,
  index: number,
): number | null | undefined {
  if (!file) return undefined;
  const row = file.spots[spotId];
  if (!row) return undefined;
  const key = sport === 'all' ? 'best' : sport === 'big-wave' ? 'surf' : sport;
  const series = row[key];
  if (!Array.isArray(series) || index < 0 || index >= series.length) return undefined;
  const n = series[index];
  if (n === null) return null;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export function hsAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  index: number,
): number | undefined {
  if (!file?.hs) return undefined;
  const series = file.hs[spotId];
  if (!series || index < 0 || index >= series.length) return undefined;
  const n = series[index];
  return Number.isFinite(n) ? n : undefined;
}

export function currentAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  index: number,
): { spd: number; dir: number } | undefined {
  if (!file?.currents) return undefined;
  const row = file.currents[spotId];
  if (!row || index < 0 || index >= row.spd.length) return undefined;
  const spd = row.spd[index];
  const dir = row.dir[index];
  if (!Number.isFinite(spd) || !Number.isFinite(dir)) return undefined;
  return { spd, dir };
}

export function windAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  index: number,
): { spd: number; dir: number } | undefined {
  if (!file?.wind) return undefined;
  const row = file.wind[spotId];
  if (!row || index < 0 || index >= row.spd.length) return undefined;
  const spd = row.spd[index];
  const dir = row.dir[index];
  if (!Number.isFinite(spd) || !Number.isFinite(dir)) return undefined;
  return { spd, dir };
}

export function sstAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  index: number,
): number | undefined {
  if (!file?.sst) return undefined;
  const series = file.sst[spotId];
  if (!series || index < 0 || index >= series.length) return undefined;
  const n = series[index];
  return Number.isFinite(n) ? n : undefined;
}

export function thermalAtHour(
  file: MapHoursFile | null | undefined,
  spotId: string,
  index: number,
): number | undefined {
  if (!file?.thermal) return undefined;
  const series = file.thermal[spotId];
  if (!series || index < 0 || index >= series.length) return undefined;
  const n = series[index];
  return Number.isFinite(n) ? n : undefined;
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

function parseHs(raw: unknown, timesLen: number): Record<string, number[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || timesLen < 2) return undefined;
  const out: Record<string, number[]> = {};
  for (const [spotId, series] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(series) || series.length !== timesLen) continue;
    const nums = series.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) continue;
    out[spotId] = nums;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseCurrents(
  raw: unknown,
  timesLen: number,
): Record<string, { spd: number[]; dir: number[] }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || timesLen < 2) return undefined;
  const out: Record<string, { spd: number[]; dir: number[] }> = {};
  for (const [spotId, row] of Object.entries(raw as Record<string, unknown>)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const c = row as { spd?: unknown; dir?: unknown };
    if (!Array.isArray(c.spd) || !Array.isArray(c.dir)) continue;
    if (c.spd.length !== timesLen || c.dir.length !== timesLen) continue;
    const spd = c.spd.map(Number);
    const dir = c.dir.map(Number);
    if (spd.some((n) => !Number.isFinite(n)) || dir.some((n) => !Number.isFinite(n))) continue;
    out[spotId] = { spd, dir };
  }
  return Object.keys(out).length ? out : undefined;
}

let hoursCache: MapHoursFile | null | undefined;
let hoursInflight: Promise<MapHoursFile | null> | null = null;

export async function fetchMapHours(): Promise<MapHoursFile | null> {
  if (hoursCache !== undefined) return hoursCache;
  if (hoursInflight) return hoursInflight;

  const promise = (async () => {
    try {
      const res = await fetch(getAssetPath(MAP_HOURS_PATH));
      if (!res.ok) return null;
      const data = (await res.json()) as MapHoursFile;
      if (!Array.isArray(data.times) || data.times.length < 2) return null;
      if (!data.spots || typeof data.spots !== 'object') return null;
      return {
        ...data,
        tides: parseTides(data.tides),
        hs: parseHs(data.hs, data.times.length),
        sst: parseHs(data.sst, data.times.length),
        thermal: parseHs(data.thermal, data.times.length),
        currents: parseCurrents(data.currents, data.times.length),
      };
    } catch {
      return null;
    }
  })()
    .then((v) => {
      hoursCache = v;
      return v;
    })
    .finally(() => {
      hoursInflight = null;
    });

  hoursInflight = promise;
  return promise;
}

/** Test hook: clear the module cache. */
export function clearMapHoursCache(): void {
  hoursCache = undefined;
  hoursInflight = null;
}
