import {
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
  MAP_NAUTICAL_CHART_LS_KEY,
  MAP_ISOBATHS_LS_KEY,
  MAP_COASTAL_LS_KEY,
  MAP_BATHYMETRY_LS_KEY,
  MAP_SEAMARKS_LS_KEY,
} from '@/lib/map-constants';

const MOBILE_MQ = '(max-width: 767px)';

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

/**
 * Mobile always starts clustered — ignore localStorage.
 * (Persisted wind-on + cluster-off freezes /mapa for seconds.)
 * Desktop defaults clustered too: 185 pins + wind rings at country zoom are
 * an unreadable wall — the cluster group already explodes into individual
 * markers as the user zooms in (zoom-aware), so turning the «Agrupar spots»
 * toggle off («mostrar todos») is opt-in.
 */
export function readClusterPref(): boolean {
  if (typeof window === 'undefined') return true;
  if (isMobileViewport()) return true;
  try {
    const v = localStorage.getItem(MAP_CLUSTER_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  return true;
}

/**
 * Mobile always starts with wind rings off — ignore localStorage.
 */
export function readWindPref(): boolean {
  if (typeof window === 'undefined') return true;
  if (isMobileViewport()) return false;
  try {
    const v = localStorage.getItem(MAP_WIND_LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* noop */
  }
  return true;
}

export function readOnlyOnPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MAP_ONLY_ON_LS_KEY) === '1';
  } catch {
    /* noop */
  }
  return false;
}

/**
 * Carta náutica (Fase 3 — isóbatas + batimetria + seamarks num toggle):
 * preferência persistida (`'1'`/`'0'`) ou `undefined` se nunca foi tocada —
 * o default (ligado no hero, desligado nos restantes mapas) fica para o
 * chamador encaixar, já que difere por embedMode. undefined ≠ off.
 *
 * Migração: sem a key nova, cai nas três keys legadas — qualquer uma ligada
 * liga a carta; alguma explicitamente desligada ('0') respeita o off.
 */
export function readNauticalChartPref(): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const v = localStorage.getItem(MAP_NAUTICAL_CHART_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    const legacy = [MAP_ISOBATHS_LS_KEY, MAP_BATHYMETRY_LS_KEY, MAP_SEAMARKS_LS_KEY]
      .map((k) => localStorage.getItem(k));
    if (legacy.includes('1')) return true;
    if (legacy.includes('0')) return false;
  } catch {
    /* noop */
  }
  return undefined;
}

/**
 * Avisos à navegação costeiros (IH): preferência persistida (`'1'`/`'0'`) ou
 * `undefined` se nunca foi tocada — o default (desligado) fica no chamador.
 */
export function readCoastalWarningsPref(): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const v = localStorage.getItem(MAP_COASTAL_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  return undefined;
}
