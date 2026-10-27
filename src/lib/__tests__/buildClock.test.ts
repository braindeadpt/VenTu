import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILD_NOW_ENV, buildNowMs, parseBuildNow } from '@/lib/buildClock';
import { computeBestWindowsForSpot, computeUpcomingWindowsForSpot } from '@/lib/bestWindowBuild';
import { spots } from '@/lib/spots';
import type { Conditions } from '@/lib/sportScore';
import type { Spot } from '@/types';

const ISO = '2026-10-27T11:13:30Z';
const ISO_MS = Date.UTC(2026, 9, 27, 11, 13, 30);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('parseBuildNow', () => {
  it('sem valor → null (relógio real)', () => {
    expect(parseBuildNow(undefined)).toBeNull();
    expect(parseBuildNow(null)).toBeNull();
    expect(parseBuildNow('')).toBeNull();
    expect(parseBuildNow('   ')).toBeNull();
  });

  it('ISO com Z', () => {
    expect(parseBuildNow(ISO)).toBe(ISO_MS);
    expect(parseBuildNow(` ${ISO} `)).toBe(ISO_MS);
    expect(parseBuildNow('2026-10-27T11:13Z')).toBe(ISO_MS - 30_000);
    expect(parseBuildNow('2026-10-27T11:13:30.250Z')).toBe(ISO_MS + 250);
  });

  it('ISO com desvio explícito', () => {
    expect(parseBuildNow('2026-10-27T12:13:30+01:00')).toBe(ISO_MS);
    expect(parseBuildNow('2026-10-27T08:13:30-03:00')).toBe(ISO_MS);
    // Dia local ≠ dia UTC continua válido.
    expect(parseBuildNow('2026-10-28T00:30:00+02:00')).toBe(Date.UTC(2026, 9, 27, 22, 30));
  });

  it.each([
    '2026-10-27',
    '2026-10-27T11:13:30',
    '2026-10-27 11:13:30Z',
    '1793099610000',
    'ontem',
    '2026-10-27T11:13:30+0100',
  ])('rejeita formato sem data/hora/fuso explícitos: %s', (raw) => {
    expect(() => parseBuildNow(raw)).toThrow(BUILD_NOW_ENV);
  });

  it('rejeita datas e horas inexistentes', () => {
    expect(() => parseBuildNow('2026-02-30T10:00:00Z')).toThrow(/inexistente/);
    expect(() => parseBuildNow('2026-13-01T10:00:00Z')).toThrow(BUILD_NOW_ENV);
    expect(() => parseBuildNow('2026-10-27T25:00:00Z')).toThrow(BUILD_NOW_ENV);
  });
});

describe('buildNowMs', () => {
  it('sem VENTU_BUILD_NOW = Date.now() (produção inalterada)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2030, 0, 2, 3, 4, 5)));
    expect(buildNowMs({})).toBe(Date.UTC(2030, 0, 2, 3, 4, 5));
    expect(buildNowMs({ [BUILD_NOW_ENV]: '' })).toBe(Date.UTC(2030, 0, 2, 3, 4, 5));
  });

  it('com VENTU_BUILD_NOW = o instante congelado, seja qual for o relógio', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2030, 0, 2, 3, 4, 5)));
    expect(buildNowMs({ [BUILD_NOW_ENV]: ISO })).toBe(ISO_MS);
  });

  it('lê process.env por omissão', () => {
    vi.stubEnv(BUILD_NOW_ENV, ISO);
    expect(buildNowMs()).toBe(ISO_MS);
  });

  it('valor inválido falha o build em vez de cair no relógio real', () => {
    vi.stubEnv(BUILD_NOW_ENV, 'amanhã');
    expect(() => buildNowMs()).toThrow(BUILD_NOW_ENV);
  });
});

describe('janelas do build seguem o relógio congelado', () => {
  const spot = spots.find((s) => s.compatibleSports?.includes('surf')) as Spot;
  const HOUR_MS = 3_600_000;
  // 72 h de surf forte desde as 00:00Z do dia congelado (como upcomingWindows.test).
  const t0 = Date.UTC(2026, 9, 27, 0, 0);
  const forecast = Array.from({ length: 72 }, (_, i) => ({
    time: new Date(t0 + i * HOUR_MS).toISOString(),
    waveHeight: 2.0,
    wavePeriod: 14,
    windSpeed: 4,
    windDirection: 90,
    windGust: 6,
    waterTemp: 18,
  }));
  const conditions: Conditions = {
    waveHeight: 1.5,
    wavePeriod: 12,
    waveDirection: 300,
    windSpeed: 4,
    windDirection: 90,
    windGust: 6,
    waterTemp: 18,
  };

  it('omitir nowMs com VENTU_BUILD_NOW = passar o instante congelado (relógio do sistema noutro dia)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 3, 9, 0)));
    vi.stubEnv(BUILD_NOW_ENV, ISO);
    const congelado = computeUpcomingWindowsForSpot(spot, forecast, conditions, ISO_MS);
    expect(Object.keys(congelado).length).toBeGreaterThan(0);
    expect(computeUpcomingWindowsForSpot(spot, forecast, conditions)).toEqual(congelado);
    // Com o relógio do sistema (3/11) a série já acabou: sem a variável não haveria janelas.
    vi.unstubAllEnvs();
    expect(computeUpcomingWindowsForSpot(spot, forecast, conditions)).toEqual({});
    vi.stubEnv(BUILD_NOW_ENV, ISO);
    expect(computeBestWindowsForSpot(spot, forecast)).toEqual(computeBestWindowsForSpot(spot, forecast, ISO_MS));
  });
});
