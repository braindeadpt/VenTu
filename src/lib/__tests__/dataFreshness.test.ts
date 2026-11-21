import { describe, expect, it, vi } from 'vitest';
import {
  formatForecastUpdatedAt,
  formatForecastUpdatedParts,
  getDataFreshness,
  isDawnPatrolStale,
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

describe('formatForecastUpdatedAt — "hoje" é o dia de Lisboa', () => {
  // 2026-08-15T22:30Z é 23:30 em Lisboa (dia 15) mas dia 16 em Auckland.
  const ts = new Date('2026-08-15T22:30:00Z').getTime();
  const nextLisbonDay = new Date('2026-08-15T23:30:00Z').getTime(); // 00:30 LIS dia 16
  // 11:00Z = 12:00 Lisboa dia 15, mas em Auckland ainda é dia 15
  // (23:00) enquanto o ts já é dia 16 — a comparação no fuso local (o bug
  // original) dizia «outro dia» e este teste falhava.
  const lisbonDay15Now = new Date('2026-08-15T11:00:00Z').getTime();

  it('viewer em Auckland: updatedAt e now no mesmo dia de Lisboa → "às"', () => {
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      // Em Auckland o ts já é dia 16 local; antes do fix isToday comparava
      // no fuso local e dizia «dia» em vez de «às», e podia divergir do
      // HTML baked (React #418).
      const out = formatForecastUpdatedAt(ts, 'pt', lisbonDay15Now);
      // Mesmo dia de Lisboa → só a hora, sem o dia ("Actualizado 23:30").
      expect(out).toContain('23:30');
      expect(out).not.toMatch(/\bago\b| de /);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  it('dia de Lisboa diferente → label com dia', () => {
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      const out = formatForecastUpdatedAt(ts, 'pt', nextLisbonDay);
      // 15T23:30 LIS vs now=16T00:30 LIS: outro dia de Lisboa → "15 ago, 23:30".
      expect(out).toMatch(/15/);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});

describe('isDawnPatrolStale', () => {
  it('mede a data de Lisboa, independente do fuso do browser', () => {
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      // Mock de "agora": 2026-08-17T10:00Z. O DP de 2026-08-16 (meio-dia
      // Lisboa = 11:00Z) tem 23h → fresco. Com o código antigo, em Auckland
      // (UTC+12) meio-dia local era 2026-08-16T00:00Z → 34h → stale: este
      // teste falhava antes do fix.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-17T10:00:00Z'));
      expect(isDawnPatrolStale('2026-08-16')).toBe(false);
      expect(isDawnPatrolStale('2026-08-15')).toBe(true);
    } finally {
      vi.useRealTimers();
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});
