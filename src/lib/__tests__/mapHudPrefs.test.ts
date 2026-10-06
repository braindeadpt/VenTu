import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readNauticalChartPref } from '@/components/spots/mapHudPrefs';

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

describe('mapHudPrefs — readNauticalChartPref', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('sem preferência gravada → undefined (o default é do embedMode, não forçado)', () => {
    mockLocalStorage();
    expect(readNauticalChartPref()).toBeUndefined();
  });

  it("key nova '1' → true (ligado entre visitas)", () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.nauticalChart', '1');
    expect(readNauticalChartPref()).toBe(true);
  });

  it("key nova '0' → false (desligado entre visitas)", () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.nauticalChart', '0');
    expect(readNauticalChartPref()).toBe(false);
  });

  it('key nova vence as legadas mesmo quando discordam', () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.nauticalChart', '0');
    store.set('ventu.map.isobaths', '1');
    expect(readNauticalChartPref()).toBe(false);
  });

  it('migração: qualquer key legada ligada → true', () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.isobaths', '0');
    store.set('ventu.map.seamarks', '1');
    expect(readNauticalChartPref()).toBe(true);
  });

  it('migração: key legada explicitamente desligada → false', () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.bathymetry', '0');
    expect(readNauticalChartPref()).toBe(false);
  });

  it('valor inválido/exótico → undefined (cai ao default do mapa)', () => {
    const { store } = mockLocalStorage();
    store.set('ventu.map.nauticalChart', 'banana');
    expect(readNauticalChartPref()).toBeUndefined();
  });

  it('SSR (sem window/localStorage) → undefined sem rebentar', () => {
    expect(readNauticalChartPref()).toBeUndefined();
  });
});
