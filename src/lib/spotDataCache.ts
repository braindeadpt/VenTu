import { getAssetPath } from '@/lib/paths';

/** Parsed conditions.json — shared across spot navigations (avoids re-fetch/re-parse). */
let conditionsCache: Record<string, unknown> | null = null;
let conditionsFetchedAt = 0;
let conditionsInflight: Promise<Record<string, unknown>> | null = null;

/**
 * Janela em que um pedido «fresco» (`force`) reutiliza o último download.
 * A home monta 3–4 consumidores de conditions.json (hero, A bombar, ranking,
 * favoritos), cada um a pedir refresh no mount: sem esta janela eram 3–4
 * downloads de ~765 KB no mesmo load. Fica muito abaixo do throttle de
 * refresh por visibilidade (5 min) e do intervalo de polling (15 min).
 */
export const CONDITIONS_FRESH_TTL_MS = 60_000;

/** Parsed forecasts.json (~8MB) — one parse per session. */
let forecastsCache: Record<string, unknown> | null = null;
let forecastsInflight: Promise<Record<string, unknown>> | null = null;

async function fetchJsonRecord(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`fetch ${path} ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * conditions.json partilhado por todos os consumidores do cliente.
 *
 * - Sem `force`: devolve a cache da sessão (ou o pedido em curso).
 * - Com `force` (refresh do mapa/grid): devolve a cache se tiver menos de
 *   `CONDITIONS_FRESH_TTL_MS`; caso contrário revalida com `cache: 'no-cache'`
 *   (ETag/If-None-Match → 304 barato no GitHub Pages em vez de 765 KB).
 * - Em qualquer caso, pedidos simultâneos partilham UMA promessa em curso:
 *   no máximo um download por load, venha de quantos componentes vier.
 */
export function loadConditionsJson(options?: { force?: boolean }): Promise<Record<string, unknown>> {
  const force = Boolean(options?.force);
  if (conditionsCache) {
    const age = Date.now() - conditionsFetchedAt;
    if (!force || age < CONDITIONS_FRESH_TTL_MS) return Promise.resolve(conditionsCache);
  }
  if (conditionsInflight) return conditionsInflight;

  const promise = fetchJsonRecord(getAssetPath('/data/conditions.json'), {
    // 'no-cache' ≠ 'no-store': o browser revalida com o ETag e só descarrega
    // o corpo quando o ficheiro mudou de facto (pipeline a cada 2–4 h).
    cache: force ? 'no-cache' : 'default',
  })
    .then((data) => {
      conditionsCache = data;
      conditionsFetchedAt = Date.now();
      return data;
    })
    .finally(() => {
      if (conditionsInflight === promise) conditionsInflight = null;
    });

  conditionsInflight = promise;
  return promise;
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
  conditionsFetchedAt = 0;
  forecastsCache = null;
  conditionsInflight = null;
  forecastsInflight = null;
  spotForecastCache.clear();
  spotForecastInflight.clear();
}
