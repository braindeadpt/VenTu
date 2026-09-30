import type { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { lisbonHourKeyFromDate } from '../../../src/lib/openMeteoTime';

/**
 * Reusable data-file interception for e2e specs.
 *
 * The build data (public/data/conditions.json etc.) has no fresh buoy
 * readings today, so specs that exercise the observed-wave / buoy / tide UI
 * transform the served JSON client-side. This module centralises that:
 *
 *   - `interceptData` — THE single data-file interceptor (serve a crafted
 *     JSON file for a given path). Every simple `intercept*` helper delegates
 *     here; specs for files without a dedicated helper (e.g. dawn-patrol.json)
 *     call it directly instead of inlining a page.route copy.
 *   - `interceptConditions` — serves conditions.json with per-spot transforms
 *     (and/or a whole-file transform), so different spots can carry different
 *     fixtures in the same test.
 *   - `interceptIhBuoys` — serves ih-buoys.json (the buoy-layer health file).
 *   - `interceptWarnings` — serves warnings.json (IPMA/MeteoAlarm per-spot map).
 *   - `interceptRadar` — serves radar.json (the IPMA radar frames carousel).
 *   - `freshObservedWave` / `withoutObservedWave` / `withoutObservedWind` —
 *     common per-spot fixtures.
 *
 * NOTE: the site registers a service worker (public/sw.js) that serves
 * /data/* from cache and BYPASSES page.route — specs using these helpers must
 * add `test.use({ serviceWorkers: 'block' })` (the historical cause of
 * intermittent e2e flakes in this suite).
 */

export const CONDITIONS_PATH = join(process.cwd(), 'public', 'data', 'conditions.json');
export const FORECASTS_PATH = join(process.cwd(), 'public', 'data', 'forecasts.json');

/** Read the real build conditions once per process (immutable snapshot). */
const conditionsCache = new Map<string, Record<string, Record<string, unknown>>>();
export function readRealConditions(): Record<string, Record<string, unknown>> {
  if (!conditionsCache.has(CONDITIONS_PATH)) {
    conditionsCache.set(
      CONDITIONS_PATH,
      JSON.parse(readFileSync(CONDITIONS_PATH, 'utf-8')) as Record<string, Record<string, unknown>>,
    );
  }
  return conditionsCache.get(CONDITIONS_PATH)!;
}

export interface ConditionsTransform {
  /**
   * Per-spot transforms keyed by the conditions.json spot id (e.g. 'guincho').
   * The entry is the real build entry; return the transformed entry.
   */
  spots?: Record<string, (entry: Record<string, unknown>) => Record<string, unknown>>;
  /** Whole-file transform, applied AFTER the per-spot ones. */
  all?: (data: Record<string, Record<string, unknown>>) => Record<string, Record<string, unknown>>;
}

export interface InterceptDataOptions {
  /** HTTP status to fulfill with (default 200). */
  status?: number;
}

/**
 * The single data-file interceptor: serve `file` JSON for every request
 * matching `path`. `path` may be a full glob (a pattern starting with the
 * double-asterisk) or a bare filename ('radar.json') — bare names get the
 * data prefix applied automatically, so callers only name the file. All the
 * named intercept* helpers delegate here. Pass `{ status: 404 }` to simulate
 * a missing file (the app's fetch fallback path). Register BEFORE page.goto.
 */
/**
 * Spot pages bake the build snapshot and skip the client data fetch (since
 * 847350f9c). Hermetic specs craft /data/* files, which only works if the
 * page actually fetches them — set `ventu_live=1` so the spot page takes its
 * client-fetch path (the same production code used when no bake exists),
 * making the interception hermetic again. Inert on home/mapa (they always
 * fetch live) and in production (nobody sets the cookie). Persists across
 * reloads, so dismiss/reload tests keep their fixtures.
 */
export async function forceLiveSpotMode(page: Page): Promise<void> {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1';
  await page.context().addCookies([{ name: 'ventu_live', value: '1', url: baseUrl }]);
}

export async function interceptData(
  page: Page,
  path: string,
  file: unknown,
  options: InterceptDataOptions = {},
): Promise<void> {
  await forceLiveSpotMode(page);

  const glob = path.startsWith('**') ? path : `**/data/${path}`;
  await page.route(glob, async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(file),
    });
  });
}

/**
 * Intercept every request to /data/conditions.json and serve the real build
 * data with the requested transforms. Register BEFORE page.goto.
 */
export async function interceptConditions(page: Page, transform: ConditionsTransform = {}): Promise<void> {
  await forceLiveSpotMode(page);
  await page.route('**/data/conditions.json', async (route) => {
    const data = readRealConditions();
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, entry] of Object.entries(data)) {
      const t = transform.spots?.[key];
      out[key] = t ? t(entry) : entry;
    }
    const final = transform.all ? transform.all(out) : out;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(final),
    });
  });
}

/**
 * Intercept /data/ih-buoys.json (the file loadBuoyLayerHealth derives
 * no-key/down/stale/ok from) and serve a crafted file.
 */
export async function interceptIhBuoys(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'ih-buoys.json', file);
}

/**
 * Intercept /data/wmo-buoys.json (the keyless Copernicus fallback the notice
 * combines with the IH state — «WMO em baixo» note) and serve a crafted file.
 */
export async function interceptWmoBuoys(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'wmo-buoys.json', file);
}

/**
 * Intercept /data/spot-isobaths.json (the IH isobath depth strip file) and
 * serve a crafted file.
 */
export async function interceptIsobaths(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'spot-isobaths.json', file);
}

/**
 * Intercept /data/ih-coastal-warnings.json (the IH coastal navigation
 * warnings file with per-spot coverage) and serve a crafted file.
 */
export async function interceptCoastalNavWarnings(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'ih-coastal-warnings.json', file);
}

/**
 * Intercept /data/wave-bias.json (the regional-bias fallback file the spot
 * page fetches client-side) and serve a crafted file. Omit to let the real
 * (usually missing) file 404 → fallback never applies.
 */
export async function interceptWaveBias(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'wave-bias.json', file);
}

/**
 * Intercept /data/warnings.json (the IPMA/MeteoAlarm warnings file with the
 * per-spot `spotWarnings` map the mar-perigoso chip and badge read) and serve
 * a crafted file. Shared by the spot/map/homepage specs that exercise the
 * «Mar perigoso» warning surfaces.
 */
export async function interceptWarnings(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'warnings.json', file);
}

/**
 * Intercept /data/radar.json (the IPMA radar frames file the RadarCarousel
 * animates on /mapa, the hero and the grid map) and serve a crafted file.
 * The radar stub (12 frames newest-first) is reused verbatim by every
 * carousel spec — the helper removes the 7 inline page.route copies.
 */
export async function interceptRadar(page: Page, file: Record<string, unknown>): Promise<void> {
  await interceptData(page, 'radar.json', file);
}

/**
 * Intercept /data/map-hours.json (48 h score timeline for /mapa).
 */
export async function interceptMapHours(page: Page, file: unknown): Promise<void> {
  await interceptData(page, 'map-hours.json', file);
}

/** Read the real build forecasts once per process (immutable snapshot). */
const forecastsCache = new Map<string, Record<string, Array<Record<string, unknown>>>>();
export function readRealForecasts(): Record<string, Array<Record<string, unknown>>> {
  if (!forecastsCache.has(FORECASTS_PATH)) {
    forecastsCache.set(
      FORECASTS_PATH,
      JSON.parse(readFileSync(FORECASTS_PATH, 'utf-8')) as Record<
        string,
        Array<Record<string, unknown>>
      >,
    );
  }
  return forecastsCache.get(FORECASTS_PATH)!;
}

/** Keep timeline/tide tests inside the data's coverage, independent of today's date.
 * Only Date is fixed: timers, rAF and user interactions keep running normally.
 */
export async function alignClockToForecast(page: Page, spotId = 'guincho'): Promise<void> {
  const rows = JSON.parse(readFileSync(
    join(process.cwd(), 'public', 'data', 'forecasts', `${spotId}.json`), 'utf-8',
  )) as Array<{ time: string }>;
  if (rows.length < 72) throw new Error(`Forecast fixture ${spotId} needs at least 72 hours`);
  // Noon on the first day (+0/+1 h Lisbon offset) leaves a full 48 h window.
  await page.clock.setFixedTime(new Date(`${rows[12].time}Z`));
}

/** Observation tests use fresh readings generated by the Node clock.
 * Move the forecast's calendar coverage to that same day, retaining its
 * real hourly variation; do not freeze the browser in a different week.
 */
export async function interceptForecastsForToday(page: Page): Promise<void> {
  const day = lisbonHourKeyFromDate(new Date()).slice(0, 10);
  await interceptForecasts(page, {
    spots: Object.fromEntries(Object.keys(readRealForecasts()).map((id) => [id, redate])),
  });
  function redate(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return rows;
    const firstDay = String(rows[0].time).slice(0, 10);
    const shift = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`);
    return rows.map((row) => ({ ...row, time: new Date(Date.parse(`${row.time}Z`) + shift).toISOString().slice(0, 16) }));
  }
}

export interface ForecastTransform {
  /**
   * Per-spot transforms keyed by the forecasts.json spot id (e.g. 'guincho').
   * The entry is the real build hourly series; return the transformed series.
   */
  spots?: Record<string, (series: Array<Record<string, unknown>>) => Array<Record<string, unknown>>>;
  /** Whole-file transform, applied AFTER the per-spot ones. */
  all?: (
    data: Record<string, Array<Record<string, unknown>>>,
  ) => Record<string, Array<Record<string, unknown>>>;
}

/**
 * Intercept every request to /data/forecasts.json (full file) and
 * /data/forecasts/{id}.json (per-spot cache files, the path loadForecastForSpot
 * tries first) and serve the real build data with the requested transforms.
 * Register BEFORE page.goto. Specs that need a tide-less series (no
 * tideHeight → buildTideSchedule returns null) or a custom tide curve use
 * this — deterministic without touching conditions.json.
 */
export async function interceptForecasts(
  page: Page,
  transform: ForecastTransform = {},
): Promise<void> {
  await forceLiveSpotMode(page);
  const serveSeries = (spotId: string, series: Array<Record<string, unknown>>) => {
    const t = transform.spots?.[spotId];
    return t ? t(series) : series;
  };

  // Per-spot cache files: /data/forecasts/{id}.json
  await page.route('**/data/forecasts/*.json', async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/forecasts\/([^/]+)\.json$/);
    const spotId = match ? decodeURIComponent(match[1]) : '';
    const series = readRealForecasts()[spotId] ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serveSeries(spotId, series)),
    });
  });

  // Full file fallback: /data/forecasts.json
  await page.route('**/data/forecasts.json', async (route) => {
    const data = readRealForecasts();
    const out: Record<string, Array<Record<string, unknown>>> = {};
    for (const [key, series] of Object.entries(data)) {
      const t = transform.spots?.[key];
      out[key] = t ? t(series) : series;
    }
    const final = transform.all ? transform.all(out) : out;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(final),
    });
  });
}

/** Strip observedWave from a spot entry — no fresh buoy reading. */
export function withoutObservedWave(entry: Record<string, unknown>): Record<string, unknown> {
  const { observedWave: _omit, ...rest } = entry;
  return rest;
}

/** Strip observed wind so the score uses forecast wind (no station note). */
export function withoutObservedWind(entry: Record<string, unknown>): Record<string, unknown> {
  const { observed: _omit, ...rest } = entry;
  return rest;
}

/**
 * Fresh IH buoy reading fixture — observedAt now so the 3h freshness gate
 * passes (plus the accumulated skill the merge attaches, so the correction
 * badge and the skill line render).
 */
export function freshObservedWave(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    waveHeight: 1.8,
    wavePeriod: 11,
    waveDirection: 280,
    maxWaveHeight: 2.6,
    waterTemp: 18.5,
    stationName: 'CSA92/D',
    stationArea: 'Leixões',
    distanceKm: 60,
    observedAt: new Date().toISOString(),
    source: 'ih-buoy',
    skill: { me: 0.2, mae: 0.4, rmse: 0.5, n: 47 },
    ...overrides,
  };
}
