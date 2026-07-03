import { describe, it, expect } from 'vitest';
import { computeMagicWindows, type HourlyCondition } from '@/lib/magicWindows';

function h(offsetHour: number, overrides: Partial<HourlyCondition> = {}): HourlyCondition {
  const d = new Date();
  d.setHours(d.getHours() + offsetHour, 0, 0, 0);
  return {
    time: d.toISOString(),
    waveHeight: 1.5,
    wavePeriod: 10,
    windSpeed: 6,
    windDirection: 270,
    windGust: 10,
    waterTemp: 18,
    ...overrides,
  };
}

describe('computeMagicWindows', () => {
  it('returns windows that stay within the passed hourly range', () => {
    // 36 hours of moderate conditions
    const hourly: HourlyCondition[] = [];
    // Past hours (should be excluded by caller, but computeMagicWindows
    // itself doesn't filter — we test the window boundaries)
    for (let hh = -6; hh < 36; hh++) {
      hourly.push(h(hh, { waveHeight: 1.2, windSpeed: 10 }));
    }
    // Pad: poor conditions for the 2nd half (no windows)
    for (let hh = 36; hh < 72; hh++) {
      hourly.push(h(hh, { waveHeight: 0.2, windSpeed: 2 }));
    }

    const windows = computeMagicWindows(hourly, 'surf', 'N');
    expect(windows.length).toBeGreaterThanOrEqual(0);

    for (const w of windows) {
      // start/end indices must be within the array
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThan(hourly.length);
      expect(w.end).toBeGreaterThanOrEqual(w.start);

      // duration must be coherent
      expect(w.duration).toBe(w.end - w.start + 1);

      // score is a valid percentage
      expect(w.score).toBeGreaterThanOrEqual(0);
      expect(w.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns at most 3 windows sorted by score descending', () => {
    const hourly: HourlyCondition[] = [];
    // 48 hours: good surf for the first 24h, then drops
    for (let hh = 0; hh < 48; hh++) {
      hourly.push(
        hh < 24
          ? h(hh, { waveHeight: 1.8, windSpeed: 8, windDirection: 0 })
          : h(hh, { waveHeight: 0.3, windSpeed: 2 }),
      );
    }
    const windows = computeMagicWindows(hourly, 'surf', 'N');
    expect(windows.length).toBeLessThanOrEqual(3);

    for (let i = 1; i < windows.length; i++) {
      expect(windows[i - 1].score).toBeGreaterThanOrEqual(windows[i].score);
    }
  });

  it('returns empty when no hourly slot scores ≥ 50', () => {
    const hourly: HourlyCondition[] = [];
    for (let hh = 0; hh < 24; hh++) {
      hourly.push(h(hh, { waveHeight: 0.1, windSpeed: 1 }));
    }
    const windows = computeMagicWindows(hourly, 'surf', 'N');
    expect(windows).toHaveLength(0);
  });

  it('windows never have duration > 24', () => {
    const hourly: HourlyCondition[] = [];
    for (let hh = 0; hh < 72; hh++) {
      hourly.push(h(hh, { waveHeight: 1.5, windSpeed: 10 }));
    }
    const windows = computeMagicWindows(hourly, 'surf', 'N');
    for (const w of windows) {
      expect(w.duration).toBeLessThanOrEqual(24);
    }
  });
});

describe('24h slice (caller responsibility)', () => {
  it('simulates the SpotDetailClient useMemo — only future 24h passed', () => {
    const HOUR_MS = 3_600_000;
    const now = Date.now();
    const cutoff = now + 24 * HOUR_MS;

    const raw: HourlyCondition[] = [];
    // mix of past, present, future
    for (let hh = -12; hh < 48; hh++) {
      raw.push(h(hh, { waveHeight: 1.5, windSpeed: 10 }));
    }

    const filtered = raw.filter((h) => {
      const t = new Date(h.time).getTime();
      return t >= now && t < cutoff;
    });

    expect(filtered.length).toBeGreaterThanOrEqual(0);
    expect(filtered.length).toBeLessThanOrEqual(25); // 24h + possible current partial hour

    for (const f of filtered) {
      const t = new Date(f.time).getTime();
      expect(t).toBeGreaterThanOrEqual(now);
      expect(t).toBeLessThan(cutoff);
    }
  });
});
