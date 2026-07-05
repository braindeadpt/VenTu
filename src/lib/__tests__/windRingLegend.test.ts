import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WIND_RING_LEGEND_LS_KEY,
  hasSeenWindRingLegend,
  markWindRingLegendSeen,
} from '../windRingLegend';

function mockLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', ls);
  return store;
}

describe('windRingLegend storage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    mockLocalStorage();
  });

  it('starts unseen', () => {
    expect(hasSeenWindRingLegend()).toBe(false);
  });

  it('marks seen after dismiss', () => {
    markWindRingLegendSeen();
    expect(localStorage.getItem(WIND_RING_LEGEND_LS_KEY)).toBe('1');
    expect(hasSeenWindRingLegend()).toBe(true);
  });
});
