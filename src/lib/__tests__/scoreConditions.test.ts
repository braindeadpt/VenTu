import { describe, it, expect } from 'vitest';
import { spots } from '@/lib/spots';
import { getSportScore, SCORE_TIER_THRESHOLDS } from '@/lib/sportScore';
import {
  applyObservedWindForScore,
  ktToMs,
  msToKt,
  rawToScoreInput,
} from '@/lib/scoreConditions';
import type { ObservedConditions } from '@/lib/observations';

function spotBySlug(slug: string) {
  const spot = spots.find((s) => s.slug === slug);
  if (!spot) throw new Error(`Spot not found: ${slug}`);
  return spot;
}

const freshObserved = (windKt: number, dir = 315): ObservedConditions => ({
  windSpeedKt: windKt,
  windDirDeg: dir,
  windCardinal: 'NW',
  stationName: 'Test',
  distanceKm: 5,
  observedAt: new Date().toISOString(),
  source: 'ipma',
});

describe('scoreConditions', () => {
  it('converts kt ↔ m/s', () => {
    expect(msToKt(ktToMs(15))).toBeCloseTo(15, 1);
  });

  it('uses fresh observed wind for scoring', () => {
    const guincho = spotBySlug('guincho');
    const forecast = {
      waveHeight: 0.8,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
    };
    const withObs = applyObservedWindForScore(forecast, freshObserved(16, 337));
    const forecastScore = getSportScore(guincho, 'kitesurf', forecast).score;
    const observedScore = getSportScore(guincho, 'kitesurf', withObs).score;
    expect(forecastScore).toBeLessThan(40);
    expect(observedScore).toBeGreaterThan(70);
  });

  it('ignores stale observed wind', () => {
    const base = {
      waveHeight: 1,
      wavePeriod: 10,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
    };
    const stale: ObservedConditions = {
      ...freshObserved(20),
      observedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    };
    expect(applyObservedWindForScore(base, stale)).toEqual(base);
  });

  it('rawToScoreInput applies observed from pipeline JSON', () => {
    const guincho = spotBySlug('guincho');
    const raw = {
      waveHeight: 0.8,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(7),
      windDirection: 270,
      windGust: ktToMs(9),
      waterTemp: 18,
      observed: freshObserved(15, 337),
    };
    const score = getSportScore(guincho, 'kitesurf', rawToScoreInput(raw)).score;
    expect(score).toBeGreaterThan(60);
  });
});

describe('kitesurf marginal wind differentiation', () => {
  it('8kt and 10kt produce different scores (not flat 15)', () => {
    const guincho = spotBySlug('guincho');
    const base = {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
    };
    const eight = getSportScore(guincho, 'kitesurf', { ...base, windSpeed: ktToMs(8) }).score;
    const ten = getSportScore(guincho, 'kitesurf', { ...base, windSpeed: ktToMs(10) }).score;
    expect(eight).not.toEqual(ten);
    expect(eight).toBeLessThan(SCORE_TIER_THRESHOLDS.fair);
    expect(ten).toBeLessThan(SCORE_TIER_THRESHOLDS.fair);
  });
});

describe('windsurf marginal wind differentiation', () => {
  it('8kt and 12kt produce different scores (not flat 15)', () => {
    const guincho = spotBySlug('guincho');
    const base = {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windDirection: 270,
      windGust: ktToMs(14),
      waterTemp: 18,
    };
    const eight = getSportScore(guincho, 'windsurf', { ...base, windSpeed: ktToMs(8) }).score;
    const twelve = getSportScore(guincho, 'windsurf', { ...base, windSpeed: ktToMs(12) }).score;
    expect(eight).not.toEqual(twelve);
    expect(eight).toBeLessThan(SCORE_TIER_THRESHOLDS.fair);
    expect(twelve).toBeLessThan(SCORE_TIER_THRESHOLDS.fair);
  });
});
