import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PIPELINE_SCHEDULE, pipelineSchedule } from '@/lib/dataPipelineSchedule';

function mockLocalStorageWithWindow() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<EventListener>>();
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
  class MockCustomEvent extends Event {
    detail: unknown;
    constructor(type: string, opts?: EventInit & { detail?: unknown }) {
      super(type, opts);
      this.detail = opts?.detail;
    }
  }
  const win = {
    addEventListener: (type: string, cb: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: EventListener) => {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent: (e: Event) => {
      listeners.get(e.type)?.forEach((cb) => cb(e));
      return true;
    },
    CustomEvent: MockCustomEvent,
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('localStorage', ls);
  return { store };
}

describe('pipelineSchedule copy', () => {
  it('PT medium agrees gender with «dados» (actualizados)', () => {
    expect(PIPELINE_SCHEDULE.pt.medium).toContain('actualizados');
    expect(PIPELINE_SCHEDULE.pt.medium).not.toContain('actualizadas');
    expect(pipelineSchedule('pt', 'medium')).toBe(PIPELINE_SCHEDULE.pt.medium);
  });

  it('ES medium agrees with «datos» (actualizados)', () => {
    expect(PIPELINE_SCHEDULE.es.medium).toContain('actualizados');
    expect(PIPELINE_SCHEDULE.es.medium).not.toContain('actualizadas');
  });
});

describe('favoritesStorage legacy migration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockLocalStorageWithWindow();
  });

  it('reads ventu:favorites and migrates windspot-favorites once', async () => {
    const { readFavoritesFromStorage, FAVORITES_STORAGE_KEY } = await import(
      '@/lib/favoritesStorage'
    );
    localStorage.setItem('windspot-favorites', JSON.stringify(['guincho', 'nazare']));
    expect(readFavoritesFromStorage()).toEqual(['guincho', 'nazare']);
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe(
      JSON.stringify(['guincho', 'nazare']),
    );
    expect(localStorage.getItem('windspot-favorites')).toBeNull();
  });
});

describe('theme storage legacy migration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockLocalStorageWithWindow();
  });

  it('migrates windspot:theme → ventu:theme', async () => {
    const { readThemeFromStorage, THEME_KEY } = await import(
      '@/components/layout/ThemeToggle'
    );
    localStorage.setItem('windspot:theme', 'light');
    expect(readThemeFromStorage()).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(localStorage.getItem('windspot:theme')).toBeNull();
  });
});

describe('sport storage legacy migration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockLocalStorageWithWindow();
  });

  it('migrates windspot:sport → ventu:sport', async () => {
    const { readSportFromStorage, LS_SPORT_KEY } = await import('@/lib/homepageSport');
    localStorage.setItem('windspot:sport', 'kitesurf');
    expect(readSportFromStorage()).toBe('kitesurf');
    expect(localStorage.getItem(LS_SPORT_KEY)).toBe('kitesurf');
    expect(localStorage.getItem('windspot:sport')).toBeNull();
  });
});
