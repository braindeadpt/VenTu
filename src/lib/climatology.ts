/**
 * climatology.json — médias mensais NASA POWER (MERRA-2, baseline
 * 2001–2020) por spot. Artefacto raro (scripts/fetch-climatology.js,
 * `npm run data:climatology`) — não entra na cadência de ~3 h porque o
 * período climatológico é fixo.
 *
 * `loadClimatology` é o loader client-side (fetch + cache de sessão, nunca
 * lança — o card simplesmente não aparece se o ficheiro faltar).
 */

import { getAssetPath } from '@/lib/paths';

export interface SpotClimatology {
  /** 12 valores JAN..DEC (m/s) — null no mês sem dados. */
  wind: (number | null)[] | null;
  /** 12 valores JAN..DEC (°C). */
  temp: (number | null)[] | null;
  /** 12 valores JAN..DEC (mm/dia). */
  precip: (number | null)[] | null;
  windAnn?: number | null;
  tempAnn?: number | null;
  precipAnn?: number | null;
}

export interface ClimatologyFile {
  generatedAt: string;
  source: string;
  sourceUrl?: string;
  baseline: string;
  units: { wind: string; temp: string; precip: string };
  spots: Record<string, SpotClimatology>;
}

export const CLIMATOLOGY_MONTH_KEYS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/** Índice do mês corrente (0–11) — separado para testes injectarem o mês. */
export function currentMonthIndex(now: Date = new Date()): number {
  return now.getMonth();
}

let cache: ClimatologyFile | null | undefined;
let inflight: Promise<ClimatologyFile | null> | null = null;

/**
 * Fetch public/data/climatology.json uma vez por sessão (client). 404/
 * corrompido → null (o card simplesmente não aparece). Nunca lança.
 */
export async function loadClimatology(
  fetchImpl: typeof fetch = fetch,
): Promise<ClimatologyFile | null> {
  if (cache !== undefined) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/climatology.json'));
      if (!res.ok) {
        cache = null;
        return null;
      }
      const raw = (await res.json()) as ClimatologyFile;
      cache = raw && typeof raw === 'object' && raw.spots ? raw : null;
      return cache;
    } catch {
      cache = null;
      return null;
    }
  })()
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test hook: limpa o cache de sessão. */
export function clearClimatologyCache(): void {
  cache = undefined;
  inflight = null;
}

/** Sanitiza uma entrada de spot — arrays fora do formato → nulls. */
export function spotClimatology(
  file: ClimatologyFile | null,
  spotId: string,
): SpotClimatology | null {
  const raw = file?.spots?.[spotId];
  if (!raw || typeof raw !== 'object') return null;
  const arr = (v: unknown): (number | null)[] | null =>
    Array.isArray(v) && v.length === 12
      ? v.map((x) => (Number.isFinite(Number(x)) ? Number(x) : null))
      : null;
  return {
    wind: arr(raw.wind),
    temp: arr(raw.temp),
    precip: arr(raw.precip),
    windAnn: Number.isFinite(Number(raw.windAnn)) ? Number(raw.windAnn) : null,
    tempAnn: Number.isFinite(Number(raw.tempAnn)) ? Number(raw.tempAnn) : null,
    precipAnn: Number.isFinite(Number(raw.precipAnn)) ? Number(raw.precipAnn) : null,
  };
}

/** Maior valor não-nulo de uma série mensal — escala das barras. */
export function monthlyMax(series: (number | null)[] | null): number {
  if (!series) return 0;
  let max = 0;
  for (const v of series) if (v !== null && v > max) max = v;
  return max;
}
