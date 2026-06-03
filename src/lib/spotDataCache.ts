import { getAssetPath } from '@/lib/paths';

/** Parsed conditions.json — shared across spot navigations (avoids re-fetch/re-parse). */
let conditionsCache: Record<string, unknown> | null = null;
let conditionsInflight: Promise<Record<string, unknown>> | null = null;

/** Parsed forecasts.json (~8MB) — one parse per session. */
let forecastsCache: Record<string, unknown> | null = null;
let forecastsInflight: Promise<Record<string, unknown>> | null = null;

async function fetchJsonRecord(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export function loadConditionsJson(): Promise<Record<string, unknown>> {
  if (conditionsCache) return Promise.resolve(conditionsCache);
  if (!conditionsInflight) {
    conditionsInflight = fetchJsonRecord(getAssetPath('/data/conditions.json'))
      .then((data) => {
        conditionsCache = data;
        return data;
      })
      .catch((err) => {
        conditionsInflight = null;
        throw err;
      });
  }
  return conditionsInflight;
}

export function loadForecastsJson(): Promise<Record<string, unknown>> {
  if (forecastsCache) return Promise.resolve(forecastsCache);
  if (!forecastsInflight) {
    forecastsInflight = fetchJsonRecord(getAssetPath('/data/forecasts.json'))
      .then((data) => {
        forecastsCache = data;
        return data;
      })
      .catch((err) => {
        forecastsInflight = null;
        throw err;
      });
  }
  return forecastsInflight;
}

/** Test helper — reset module cache between tests. */
export function clearSpotDataCacheForTests(): void {
  conditionsCache = null;
  forecastsCache = null;
  conditionsInflight = null;
  forecastsInflight = null;
}
