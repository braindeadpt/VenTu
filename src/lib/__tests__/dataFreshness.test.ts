import { describe, expect, it } from 'vitest';
import {
  formatForecastUpdatedParts,
  getDataFreshness,
  staleThresholdHours,
} from '@/lib/dataFreshness';

// Lisbon is UTC+1 in summer (WEST) — August 2026 instants below are summer.
describe('staleThresholdHours (schedule-aware: 2h day / 4h night)', () => {
  it('uses 2.5h during Lisbon daytime (06:00–20:00)', () => {
    expect(staleThresholdHours(new Date('2026-08-15T10:00:00Z').getTime())).toBe(2.5); // 11:00 LIS
    expect(staleThresholdHours(new Date('2026-08-15T05:00:00Z').getTime())).toBe(2.5); // 06:00 LIS
    expect(staleThresholdHours(new Date('2026-08-15T18:30:00Z').getTime())).toBe(2.5); // 19:30 LIS
  });

  it('uses 5h at night — 4h cadence plus margin, so a 4h-old update is still fresh', () => {
    expect(staleThresholdHours(new Date('2026-08-15T23:00:00Z').getTime())).toBe(5); // 00:00 LIS
    expect(staleThresholdHours(new Date('2026-08-15T19:00:00Z').getTime())).toBe(5); // 20:00 LIS boundary
    expect(staleThresholdHours(new Date('2026-08-15T02:00:00Z').getTime())).toBe(5); // 03:00 LIS
  });
});

describe('getDataFreshness with the night cadence', () => {
  it('night: a 4h-old update is fresh (was stale under the fixed 2.5h gate)', () => {
    const now = new Date('2026-08-15T23:00:00Z').getTime(); // 00:00 LIS
    const updatedAt = now - 4 * 3600000;
    expect(getDataFreshness(updatedAt, now)).toBe('fresh');
  });

  it('day: a 3h-old update is stale (2.5h gate unchanged)', () => {
    const now = new Date('2026-08-15T10:00:00Z').getTime(); // 11:00 LIS
    const updatedAt = now - 3 * 3600000;
    expect(getDataFreshness(updatedAt, now)).toBe('stale');
  });

  it('night: a 6h-old update is stale (past the 5h night gate)', () => {
    const now = new Date('2026-08-15T23:00:00Z').getTime();
    const updatedAt = now - 6 * 3600000;
    expect(getDataFreshness(updatedAt, now)).toBe('stale');
  });
});

describe('formatForecastUpdatedParts', () => {
  it('returns date and time in Lisbon timezone with prefix', () => {
    const ts = new Date('2026-07-03T12:30:00Z').getTime();
    const parts = formatForecastUpdatedParts(ts, 'pt');

    expect(parts.prefix).toBe('Actualizado');
    expect(parts.datePart).toMatch(/3/);
    expect(parts.timePart).toMatch(/\d{2}:\d{2}/);
    expect(parts.combined).toContain(parts.datePart);
    expect(parts.combined).toContain(parts.timePart);
  });

  it('uses English labels', () => {
    const ts = new Date('2026-07-03T12:30:00Z').getTime();
    const parts = formatForecastUpdatedParts(ts, 'en');

    expect(parts.prefix).toBe('Updated');
  });
});
