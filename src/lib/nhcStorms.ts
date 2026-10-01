/**
 * NHC tropical storms (B0 do docs/STORM-STUDY.md) — `public/data/storms.json`
 * gerado por `scripts/fetch-nhc-storms.js` no pipeline de dados.
 *
 * Fonte oficial NOAA, keyless. Cada tempestade traz posição, classe,
 * vento, movimento, track prevista e **cone de incerteza** — renderizado
 * como cone, nunca como linha certa (honestidade da fonte).
 */

import { getAssetPath } from '@/lib/paths';

export const MAP_STORMS_LS_KEY = 'ventu.map.storms';

export interface NhcTrackPoint {
  lat: number;
  lon: number;
  forecastHr: number | null;
  validAt: string | null;
  maxWindMph: number | null;
}

export interface NhcStorm {
  id: string | null;
  name: string | null;
  /** TD | TS | HU | MH | EX | SD | SS | LO | OTHER */
  classification: string;
  classificationLabel: string | null;
  intensityMph: number;
  pressureMb: number | null;
  lat: number;
  lon: number;
  movementDirDeg: number | null;
  movementSpeedMph: number | null;
  lastUpdate: string | null;
  advisory: string | null;
  /** Anel [lon,lat] simplificado — cone de incerteza oficial. */
  cone: [number, number][] | null;
  /** Linha [lon,lat] — track prevista (posição actual → fim do forecast). */
  track: [number, number][] | null;
  trackPoints: NhcTrackPoint[] | null;
  coneTouchesRegion: boolean | null;
}

export interface NhcSpotStrike {
  id: string | null;
  name: string | null;
  classification: string;
  classificationLabel: string | null;
  centerDistKm: number;
  movementDirDeg: number | null;
  movementSpeedMph: number | null;
}

export interface NhcStormsFile {
  source: 'nhc';
  fetchedAt: string;
  region: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  storms: NhcStorm[];
  spotStorms: Record<string, NhcSpotStrike[]>;
  activeCount: number;
}

let cache: NhcStormsFile | null | undefined;
let inflight: Promise<NhcStormsFile | null> | null = null;

export async function loadNhcStorms(
  fetchImpl: typeof fetch = fetch,
): Promise<NhcStormsFile | null> {
  if (cache !== undefined) return cache;
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/storms.json'));
      if (!res.ok) return null;
      const data = (await res.json()) as NhcStormsFile;
      if (!Array.isArray(data?.storms)) return null;
      return data;
    } catch {
      return null;
    }
  })().finally(() => {
    inflight = null;
  });

  inflight = promise;
  cache = await promise;
  return cache;
}

/** Tempestades cujo cone cobre o spot (pré-computado no pipeline). */
export function stormsForSpot(file: NhcStormsFile | null | undefined, spotId: string): NhcSpotStrike[] {
  const hits = file?.spotStorms?.[spotId];
  return Array.isArray(hits) ? hits : [];
}

/** Frescura — fora disto a camada omite-se (fetch falhou ou pipeline parou). */
export const STORMS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function stormsFresh(file: NhcStormsFile | null | undefined, nowMs = Date.now()): boolean {
  if (!file?.fetchedAt) return false;
  const t = Date.parse(file.fetchedAt);
  return Number.isFinite(t) && nowMs - t < STORMS_MAX_AGE_MS;
}

/** Intensidade mph → km/h para a UI. */
export function mphToKmh(mph: number): number {
  return Math.round(mph * 1.60934);
}

/** Direcção do movimento NHC: graus para onde a tempestade VAI (não «de onde»). */
export function movementCardinal(deg: number | null, isPt: boolean): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const pt = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (isPt ? pt : en)[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
