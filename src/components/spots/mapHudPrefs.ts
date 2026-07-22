import {
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
} from '@/lib/map-constants';

const MOBILE_MQ = '(max-width: 767px)';

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

/**
 * Mobile always starts clustered — ignore localStorage.
 * (Persisted wind-on + cluster-off freezes /mapa for seconds.)
 */
export function readClusterPref(): boolean {
  if (typeof window === 'undefined') return false;
  if (isMobileViewport()) return true;
  try {
    const v = localStorage.getItem(MAP_CLUSTER_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  return false;
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
