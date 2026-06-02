import { describe, it, expect } from 'vitest';
import {
  verifyWind,
  formatObservedAge,
  formatObservedClockTime,
  forecastWindKtFromMs,
  isObservedFresh,
} from '../observations';

describe('verifyWind', () => {
  it('classifies match within 3 kt', () => {
    expect(verifyWind(12, 14).agreement).toBe('match');
    expect(verifyWind(12, 9).agreement).toBe('match');
  });

  it('classifies near within 6 kt', () => {
    expect(verifyWind(12, 17).agreement).toBe('near');
  });

  it('classifies off above 6 kt', () => {
    expect(verifyWind(12, 20).agreement).toBe('off');
  });
});

describe('forecastWindKtFromMs', () => {
  it('converts m/s to rounded knots', () => {
    expect(forecastWindKtFromMs(5)).toBe(10);
  });
});

describe('formatObservedAge', () => {
  it('formats recent minutes in PT', () => {
    const recent = new Date(Date.now() - 15 * 60_000).toISOString();
    expect(formatObservedAge(recent, 'pt')).toMatch(/há 15 min/);
  });
});

describe('isObservedFresh', () => {
  it('is fresh within 3 hours', () => {
    const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(isObservedFresh(recent)).toBe(true);
  });

  it('is stale after 3 hours', () => {
    const old = new Date(Date.now() - 4 * 3_600_000).toISOString();
    expect(isObservedFresh(old)).toBe(false);
  });
});

describe('formatObservedClockTime', () => {
  it('returns HH:mm in Lisbon', () => {
    const t = formatObservedClockTime('2026-06-01T14:30:00.000Z', 'pt');
    expect(t).toMatch(/^\d{2}:\d{2}$/);
  });
});
