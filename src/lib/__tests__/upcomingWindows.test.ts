import { describe, it, expect } from 'vitest';
import { computeUpcomingWindowsForSpot } from '@/lib/bestWindowToday';
import { spots } from '@/lib/spots';
import type { Conditions } from '@/lib/sportScore';
import type { Spot } from '@/types';

const spot = spots.find((s) => s.compatibleSports?.includes('surf')) as Spot;

const NOW = new Date('2026-01-15T09:00:00Z').getTime();
const HOUR_MS = 3_600_000;

function row(offsetHours: number, waveHeight: number, wavePeriod: number) {
  return {
    time: new Date(NOW + offsetHours * HOUR_MS).toISOString(),
    waveHeight,
    wavePeriod,
    windSpeed: 4,
    // E — inside Moledo-style bestWind 'E, NE' so the scorer sees offshore.
    windDirection: 90,
    windGust: 6,
    waterTemp: 18,
  };
}

const conditions: Conditions = {
  waveHeight: 1.5,
  wavePeriod: 12,
  waveDirection: 300,
  windSpeed: 4,
  windDirection: 90,
  windGust: 6,
  waterTemp: 18,
};

describe('computeUpcomingWindowsForSpot', () => {
  it('returns per-sport windows on the canonical scale within 48h', () => {
    // 60h of strong surf — good rows past the 48h cutoff must be excluded.
    const forecast = Array.from({ length: 60 }, (_, i) =>
      row(i, 2.0, 14),
    );

    const out = computeUpcomingWindowsForSpot(spot, forecast, conditions, NOW);
    const keys = Object.keys(out);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys.every((k) => spot.compatibleSports?.includes(k as never))).toBe(true);

    const cutoff = NOW + 48 * HOUR_MS;
    for (const w of Object.values(out)) {
      expect(w).toBeDefined();
      const start = new Date(w!.startIso).getTime();
      const end = new Date(w!.endIso).getTime();
      expect(start).toBeGreaterThanOrEqual(NOW);
      expect(start).toBeLessThan(cutoff);
      expect(end).toBeGreaterThanOrEqual(start);
      expect(end).toBeLessThan(cutoff);
      expect(w!.score).toBeGreaterThanOrEqual(60);
      expect(w!.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns empty when the forecast is flat', () => {
    const forecast = Array.from({ length: 60 }, (_, i) => row(i, 0.2, 5));
    const out = computeUpcomingWindowsForSpot(spot, forecast, conditions, NOW);
    expect(out.surf).toBeUndefined();
  });

  it('returns empty with no forecast rows', () => {
    expect(computeUpcomingWindowsForSpot(spot, [], conditions, NOW)).toEqual({});
  });

  it('ignores good conditions beyond the 48h horizon', () => {
    // Poor now, epic from +55h — outside the window: nothing may surface.
    const forecast = Array.from({ length: 72 }, (_, i) =>
      row(i, i >= 55 ? 2.2 : 0.3, i >= 55 ? 15 : 6),
    );
    const out = computeUpcomingWindowsForSpot(spot, forecast, conditions, NOW);
    for (const w of Object.values(out)) {
      expect(new Date(w!.startIso).getTime()).toBeLessThan(NOW + 48 * HOUR_MS);
    }
  });
});
