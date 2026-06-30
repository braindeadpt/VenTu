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

/**
 * Per-spot forecast cache — loads ~50KB per spot instead of 8MB full file.
 * Falls back to full forecasts.json if per-spot file not found.
 */
const spotForecastCache = new Map<string, Record<string, unknown>[]>();
const spotForecastInflight = new Map<string, Promise<Record<string, unknown>[]>>();

export function loadForecastForSpot(dataId: string): Promise<Record<string, unknown>[]> {
  if (spotForecastCache.has(dataId)) return Promise.resolve(spotForecastCache.get(dataId)!);
  if (spotForecastInflight.has(dataId)) return spotForecastInflight.get(dataId)!;

  const promise: Promise<Record<string, unknown>[]> = (async () => {
    try {
      const res = await fetch(getAssetPath(`/data/forecasts/${dataId}.json`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>[];
      spotForecastCache.set(dataId, data);
      return data;
    } catch {
      // Fallback: load the full forecasts.json
      const full = await loadForecastsJson();
      const fallback = (full[dataId] as Record<string, unknown>[]) ?? [];
      spotForecastCache.set(dataId, fallback);
      return fallback;
    }
  })();

  spotForecastInflight.set(dataId, promise);
  promise.finally(() => spotForecastInflight.delete(dataId));
  return promise;
}

/** Test helper — reset module cache between tests. */
export function clearSpotDataCacheForTests(): void {
  conditionsCache = null;
  forecastsCache = null;
  conditionsInflight = null;
  forecastsInflight = null;
  spotForecastCache.clear();
  spotForecastInflight.clear();
}
