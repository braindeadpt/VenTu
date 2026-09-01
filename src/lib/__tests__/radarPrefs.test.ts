import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RADAR_STATE_LS_KEY,
  readRadarPref,
  writeRadarPref,
  readRadarEnabledPref,
  writeRadarEnabledPref,
  resetRadarPref,
} from '@/lib/radarPrefs';

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
  return { store, ls };
}

describe('radarPrefs (pausa + frame do radar)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('default sem estado gravado → { paused: false, frame: 0 }', () => {
    mockLocalStorage();
    expect(readRadarPref()).toEqual({ paused: false, frame: 0 });
  });

  it('round-trip: writeRadarPref grava JSON e readRadarPref devolve', () => {
    const { store } = mockLocalStorage();
    writeRadarPref(true, 5);
    // Registo novo inclui enabled (undefined, nunca gravado pelo utilizador).
    expect(JSON.parse(store.get(RADAR_STATE_LS_KEY) ?? '{}')).toEqual({
      enabled: undefined,
      paused: true,
      frame: 5,
    });
    expect(readRadarPref()).toEqual({ enabled: undefined, paused: true, frame: 5 });
  });

  it('frame é sanejado: negativo → 0, decimal → floor', () => {
    mockLocalStorage();
    writeRadarPref(false, -3);
    expect(readRadarPref().frame).toBe(0);
    writeRadarPref(false, 2.9);
    expect(readRadarPref().frame).toBe(2);
  });

  it('JSON inválido → default (não rebenta)', () => {
    const { store } = mockLocalStorage();
    store.set(RADAR_STATE_LS_KEY, '{lixo');
    expect(readRadarPref()).toEqual({ paused: false, frame: 0 });
  });

  it('valores corrompidos → sane (paused só true; frame numérico)', () => {
    const { store } = mockLocalStorage();
    store.set(RADAR_STATE_LS_KEY, JSON.stringify({ paused: 'sim', frame: 'x' }));
    expect(readRadarPref()).toEqual({ paused: false, frame: 0 });
    store.set(RADAR_STATE_LS_KEY, JSON.stringify({ frame: 7 }));
    expect(readRadarPref()).toEqual({ paused: false, frame: 7 });
  });

  it('sem window (SSR) → default, sem throw', () => {
    vi.unstubAllGlobals();
    expect(readRadarPref()).toEqual({ paused: false, frame: 0 });
    expect(() => writeRadarPref(true, 3)).not.toThrow();
  });

  it('localStorage a lançar (private mode) → default sem rebentar', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    vi.stubGlobal('window', {});
    expect(readRadarPref()).toEqual({ paused: false, frame: 0 });
    expect(() => writeRadarPref(true, 3)).not.toThrow();
  });
});

describe('radarPrefs.enabled (ligar/desligar persistido entre visitas)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem estado gravado → enabled undefined (mapa usa os defaults)', () => {
    mockLocalStorage();
    expect(readRadarEnabledPref()).toBeUndefined();
    expect(readRadarPref().enabled).toBeUndefined();
  });

  it('round-trip: writeRadarEnabledPref grava e readRadarEnabledPref devolve', () => {
    const { store } = mockLocalStorage();
    expect(writeRadarEnabledPref(true)).toBeUndefined();
    expect(JSON.parse(store.get(RADAR_STATE_LS_KEY) ?? '{}')).toMatchObject({
      enabled: true,
      paused: false,
      frame: 0,
    });
    expect(readRadarEnabledPref()).toBe(true);

    writeRadarEnabledPref(false);
    expect(readRadarEnabledPref()).toBe(false);
  });

  it('enabled preserva paused/frame já gravados', () => {
    const { store } = mockLocalStorage();
    writeRadarPref(true, 5);
    writeRadarEnabledPref(false);
    expect(JSON.parse(store.get(RADAR_STATE_LS_KEY) ?? '{}')).toEqual({
      enabled: false,
      paused: true,
      frame: 5,
    });
  });

  it('registos antigos (só paused/frame) → enabled undefined, sem quebrar', () => {
    mockLocalStorage();
    writeRadarPref(true, 4);
    expect(readRadarEnabledPref()).toBeUndefined();
    expect(readRadarPref()).toEqual({ enabled: undefined, paused: true, frame: 4 });
  });

  it('JSON inválido → enabled undefined (não rebenta)', () => {
    const { store } = mockLocalStorage();
    store.set(RADAR_STATE_LS_KEY, '{lixo');
    expect(readRadarEnabledPref()).toBeUndefined();
  });

  it('resetRadarPref remove a key → volta ao default (nunca decidiu)', () => {
    const { store } = mockLocalStorage();
    writeRadarEnabledPref(true);
    writeRadarPref(true, 5);
    expect(readRadarEnabledPref()).toBe(true);

    resetRadarPref();

    expect(store.has(RADAR_STATE_LS_KEY)).toBe(false);
    expect(readRadarEnabledPref()).toBeUndefined();
    expect(readRadarPref()).toEqual({ paused: false, frame: 0 });
  });

  it('resetRadarPref sem estado gravado não rebenta', () => {
    mockLocalStorage();
    expect(() => resetRadarPref()).not.toThrow();
    expect(readRadarEnabledPref()).toBeUndefined();
  });
});
