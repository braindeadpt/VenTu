export const WIND_RING_LEGEND_LS_KEY = 'ventu:windRingLegendSeen';

export function hasSeenWindRingLegend(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(WIND_RING_LEGEND_LS_KEY) === '1';
  } catch {
    return true;
  }
}

export function markWindRingLegendSeen(): void {
  try {
    localStorage.setItem(WIND_RING_LEGEND_LS_KEY, '1');
  } catch {
    /* noop */
  }
}
