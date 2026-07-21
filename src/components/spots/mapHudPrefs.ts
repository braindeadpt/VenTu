import {
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
} from '@/lib/map-constants';

const MOBILE_MQ = '(max-width: 767px)';

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

export function readClusterPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(MAP_CLUSTER_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  // Mobile: cluster by default — 185 wind-ring markers freeze the main thread
  return isMobileViewport();
}

export function readWindPref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(MAP_WIND_LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* noop */
  }
  // Mobile: plain score pins first; user can enable wind rings after map is idle
  return !isMobileViewport();
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
