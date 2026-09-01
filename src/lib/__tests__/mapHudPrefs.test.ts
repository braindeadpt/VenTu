import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readIsobathsPref } from '@/components/spots/mapHudPrefs';

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
  vi.stubGlobal('window', {});
  return { store };
}

describe('mapHudPrefs — readIsobathsPref', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('sem preferência gravada → undefined (o default é do embedMode, não forçado)', () => {
    mockLocalStorage();
    expect(readIsobathsPref()).toBeUndefined();
  });

  it("restaura '1' → true (ligado entre visitas)", () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.isobaths', '1');
    expect(readIsobathsPref()).toBe(true);
  });

  it("restaura '0' → false (desligado entre visitas)", () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.isobaths', '0');
    expect(readIsobathsPref()).toBe(false);
  });

  it('valor inválido/exótico → undefined (cai ao default do mapa)', () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.isobaths', 'banana');
    expect(readIsobathsPref()).toBeUndefined();
  });

  it('SSR (sem window/localStorage) → undefined sem rebentar', () => {
    expect(readIsobathsPref()).toBeUndefined();
  });
});