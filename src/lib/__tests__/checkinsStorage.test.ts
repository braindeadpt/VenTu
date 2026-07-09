import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CHECKINS_STORAGE_KEY,
  CHECKINS_CHANGED_EVENT,
  readCheckinsFromStorage,
  writeCheckinsToStorage,
} from '@/lib/checkinsStorage';

function mockLocalStorageWithWindow() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<EventListener>>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
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
  return { store, listeners };
}

describe('checkinsStorage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockLocalStorageWithWindow();
  });

  it('returns empty array when nothing stored', () => {
    expect(readCheckinsFromStorage()).toEqual([]);
  });

  it('writes and reads checkins array', () => {
    writeCheckinsToStorage(['moledo', 'cabedelo']);
    expect(localStorage.getItem(CHECKINS_STORAGE_KEY)).toBe(JSON.stringify(['moledo', 'cabedelo']));
    expect(readCheckinsFromStorage()).toEqual(['moledo', 'cabedelo']);
  });

  it('overwrites existing data', () => {
    writeCheckinsToStorage(['moledo']);
    writeCheckinsToStorage(['cabedelo']);
    expect(readCheckinsFromStorage()).toEqual(['cabedelo']);
  });

  it('dispatches custom event on write', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(CHECKINS_CHANGED_EVENT, handler);
    writeCheckinsToStorage(['moledo']);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual(['moledo']);
    window.removeEventListener(CHECKINS_CHANGED_EVENT, handler);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(CHECKINS_STORAGE_KEY, 'not-json');
    expect(readCheckinsFromStorage()).toEqual([]);
  });
});