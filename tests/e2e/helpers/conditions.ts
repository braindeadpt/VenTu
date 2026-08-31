import type { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Reusable data-file interception for e2e specs.
 *
 * The build data (public/data/conditions.json etc.) has no fresh buoy
 * readings today, so specs that exercise the observed-wave / buoy / tide UI
 * transform the served JSON client-side. This module centralises that:
 *
 *   - `interceptConditions` — serves conditions.json with per-spot transforms
 *     (and/or a whole-file transform), so different spots can carry different
 *     fixtures in the same test.
 *   - `interceptIhBuoys` — serves ih-buoys.json (the buoy-layer health file).
 *   - `freshObservedWave` / `withoutObservedWave` — common per-spot fixtures.
 *
 * NOTE: the site registers a service worker (public/sw.js) that serves
 * /data/* from cache and BYPASSES page.route — specs using these helpers must
 * add `test.use({ serviceWorkers: 'block' })` (the historical cause of
 * intermittent e2e flakes in this suite).
 */

export const CONDITIONS_PATH = join(process.cwd(), 'public', 'data', 'conditions.json');

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

/**
 * Intercept every request to /data/conditions.json and serve the real build
 * data with the requested transforms. Register BEFORE page.goto.
 */
export async function interceptConditions(page: Page, transform: ConditionsTransform = {}): Promise<void> {
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
  await page.route('**/data/ih-buoys.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(file),
    });
  });
}

/**
 * Intercept /data/wmo-buoys.json (the keyless Copernicus fallback the notice
 * combines with the IH state — «WMO em baixo» note) and serve a crafted file.
 */
export async function interceptWmoBuoys(page: Page, file: Record<string, unknown>): Promise<void> {
  await page.route('**/data/wmo-buoys.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(file),
    });
  });
}

/**
 * Intercept /data/spot-isobaths.json (the IH isobath depth strip file) and
 * serve a crafted file.
 */
export async function interceptIsobaths(page: Page, file: Record<string, unknown>): Promise<void> {
  await page.route('**/data/spot-isobaths.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(file),
    });
  });
}

/**
 * Intercept /data/ih-coastal-warnings.json (the IH coastal navigation
 * warnings file with per-spot coverage) and serve a crafted file.
 */
export async function interceptCoastalNavWarnings(page: Page, file: Record<string, unknown>): Promise<void> {
  await page.route('**/data/ih-coastal-warnings.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(file),
    });
  });
}

/**
 * Intercept /data/wave-bias.json (the regional-bias fallback file the spot
 * page fetches client-side) and serve a crafted file. Omit to let the real
 * (usually missing) file 404 → fallback never applies.
 */
export async function interceptWaveBias(page: Page, file: Record<string, unknown>): Promise<void> {
  await page.route('**/data/wave-bias.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(file),
    });
  });
}

/** Strip observedWave from a spot entry — no fresh buoy reading. */
export function withoutObservedWave(entry: Record<string, unknown>): Record<string, unknown> {
  const { observedWave: _omit, ...rest } = entry;
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
