import { describe, it, expect } from 'vitest';
import {
  SYNODIC_MONTH_DAYS,
  TIDE_REGIME_WINDOW_DAYS,
  TIDE_REGIME_LAG_DAYS,
  getMoonAgeDays,
  getMoonPhase,
  getMoonPhaseFraction,
  getMoonIllumination,
  getMoonPhaseName,
  getTideRegime,
} from '../moonPhase';

describe('moonPhase', () => {
  it('full moon 2026-01-03 is near phase 0.5', () => {
    const d = new Date('2026-01-03T12:00:00Z');
    const info = getMoonPhase(d);
    expect(info.name).toBe('cheia');
    expect(info.phase).toBeGreaterThan(0.45);
    expect(info.phase).toBeLessThan(0.55);
    expect(info.illumination).toBeGreaterThan(0.95);
  });

  it('new moon 2026-01-19 is near phase 0', () => {
    const d = new Date('2026-01-19T12:00:00Z');
    const info = getMoonPhase(d);
    expect(info.name).toBe('nova');
    expect(info.phase).toBeLessThan(0.08);
    expect(info.illumination).toBeLessThan(0.1);
  });

  it('first quarter 2025-12-27', () => {
    const d = new Date('2025-12-27T12:00:00Z');
    const info = getMoonPhase(d);
    expect(info.name).toBe('quarto-crescente');
    expect(info.phase).toBeGreaterThan(0.2);
    expect(info.phase).toBeLessThan(0.3);
  });

  it('illumination peaks at full moon', () => {
    const full = getMoonIllumination(0.5);
    const newM = getMoonIllumination(0);
    const q = getMoonIllumination(0.25);
    expect(full).toBeCloseTo(1, 2);
    expect(newM).toBeCloseTo(0, 2);
    expect(q).toBeCloseTo(0.5, 1);
  });

  it('phase names cover eight octants', () => {
    expect(getMoonPhaseName(0)).toBe('nova');
    expect(getMoonPhaseName(0.125)).toBe('crescente');
    expect(getMoonPhaseName(0.25)).toBe('quarto-crescente');
    expect(getMoonPhaseName(0.375)).toBe('gibosa-crescente');
    expect(getMoonPhaseName(0.5)).toBe('cheia');
    expect(getMoonPhaseName(0.625)).toBe('gibosa-minguante');
    expect(getMoonPhaseName(0.75)).toBe('quarto-minguante');
    expect(getMoonPhaseName(0.875)).toBe('minguante');
  });

  it('spring tides after full moon (~2 days later)', () => {
    const d = new Date('2026-01-05T12:00:00Z');
    expect(getTideRegime(getMoonAgeDays(d))).toBe('vivas');
  });

  it('neap tides after first quarter (~2 days later)', () => {
    const d = new Date('2025-12-29T12:00:00Z');
    expect(getTideRegime(getMoonAgeDays(d))).toBe('mortas');
  });

  it('transition mid-cycle between spring windows', () => {
    const age = SYNODIC_MONTH_DAYS * 0.3;
    expect(getTideRegime(age)).toBe('transição');
  });

  it('regime window respects lag + width constants', () => {
    const springStart = TIDE_REGIME_LAG_DAYS + 0.01;
    expect(getTideRegime(springStart)).toBe('vivas');
    expect(getTideRegime(TIDE_REGIME_LAG_DAYS + TIDE_REGIME_WINDOW_DAYS)).toBe('vivas');
    expect(getTideRegime(TIDE_REGIME_LAG_DAYS + TIDE_REGIME_WINDOW_DAYS + 0.5)).toBe(
      'transição',
    );
  });

  it('age wraps across synodic month', () => {
    const base = new Date('2026-03-01T12:00:00Z');
    const age1 = getMoonAgeDays(base);
    const later = new Date(base.getTime() + SYNODIC_MONTH_DAYS * 86_400_000);
    const age2 = getMoonAgeDays(later);
    expect(age2).toBeCloseTo(age1, 5);
    expect(getMoonPhaseFraction(age1)).toBeCloseTo(getMoonPhaseFraction(age2), 5);
  });
});
