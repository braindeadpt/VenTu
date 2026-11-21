import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FAVORITES_STORAGE_KEY,
  readFavoritesFromStorage,
  writeFavoritesToStorage,
} from '@/lib/favoritesStorage';

function mockLocalStorageWithWindow() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  vi.stubGlobal('window', { dispatchEvent: () => true });
  vi.stubGlobal('localStorage', ls);
  return { store };
}

describe('favoritesStorage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockLocalStorageWithWindow();
  });

  it('returns empty array when nothing stored', () => {
    expect(readFavoritesFromStorage()).toEqual([]);
  });

  it('writes and reads favorites array', () => {
    writeFavoritesToStorage(['moledo', 'cabedelo']);
    expect(readFavoritesFromStorage()).toEqual(['moledo', 'cabedelo']);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, 'not-json');
    expect(readFavoritesFromStorage()).toEqual([]);
  });

  it.each(['"moledo"', '{"a":1}', '42', 'true', 'null'])(
    'returns [] when stored value parses to non-array (%s)',
    (raw) => {
      localStorage.setItem(FAVORITES_STORAGE_KEY, raw);
      expect(readFavoritesFromStorage()).toEqual([]);
    },
  );

  it('drops non-string entries from a stored array', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['moledo', 42, null, 'cabedelo']));
    expect(readFavoritesFromStorage()).toEqual(['moledo', 'cabedelo']);
  });
});
