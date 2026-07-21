import {
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
} from '@/lib/map-constants';

export function readClusterPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(MAP_CLUSTER_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  return false;
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
