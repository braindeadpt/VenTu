import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  morningScore,
  resolveMorningRecalibration,
  MIN_BIAS_N,
  MIN_BIAS_M,
  MAX_BIAS_M,
  MAX_AGE_HOURS,
} = require('../dawnPatrolScore.js');

const NOW = Date.now();
const spot = { slug: 'guincho', region: 'Cascais' };
const bestWindow = { waveHeight: 1.46, wavePeriod: 8, windSpeed: 5, score: 60 };

const freshReading = (overrides = {}) => ({
  waveHeight: 1.8,
  stationName: 'CSA92/D',
  distanceKm: 60,
  observedAt: new Date(NOW - 1 * 3_600_000).toISOString(),
  source: 'ih-buoy',
  ...overrides,
});

describe('dawnPatrolScore.morningScore', () => {
  it('replica a heurística de 0-100 (ondas/período/vento)', () => {
    // 1.5m @ 8s, vento 5 nós: 30+12 (ondas) + 15 (período) + 25 (vento) = 82
    expect(morningScore({ waveHeight: 1.5, wavePeriod: 8, windSpeed: 5 })).toBe(82);
    // 2.0m @ 12s, vento 5 nós: 30+16 + 20 + 25 = 91
    expect(morningScore({ waveHeight: 2.0, wavePeriod: 12, windSpeed: 5 })).toBe(91);
  });
});

describe('dawnPatrolScore.resolveMorningRecalibration', () => {
  it('leitura fresca da boia ganha sempre — fonte «boia»', () => {
    const conditions = { guincho: { observedWave: freshReading() } };
    const recal = resolveMorningRecalibration(spot, bestWindow, conditions, NOW);
    expect(recal).toEqual({
      height: 1.8,
      source: 'boia',
      meta: { stationName: 'CSA92/D', distanceKm: 60 },
    });
  });

  it('leitura velha (>3h IH) não é usada — cai para o viés regional', () => {
    const conditions = {
      guincho: {
        observedWave: freshReading({ observedAt: new Date(NOW - 5 * 3_600_000).toISOString() }),
        waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
      },
    };
    const recal = resolveMorningRecalibration(spot, bestWindow, conditions, NOW);
    expect(recal?.source).toBe('viés regional');
    expect(recal?.height).toBe(1.8); // 1.46 + 0.3 → round1
    expect(recal?.meta).toEqual({ region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 });
  });

  it('viés regional da row aplica-se com os gates da pipeline', () => {
    const conditions = {
      guincho: { waveBias: { region: 'Cascais', me: 0.3, n: MIN_BIAS_N, deltaM: 0.3 } },
    };
    expect(resolveMorningRecalibration(spot, bestWindow, conditions, NOW)?.height).toBe(1.8);

    // n < 30 → sem correcção.
    const lowN = { guincho: { waveBias: { region: 'Cascais', me: 0.3, n: MIN_BIAS_N - 1 } } };
    expect(resolveMorningRecalibration(spot, lowN, conditions, NOW)).toBeNull();

    // |me| fora de [MIN_BIAS_M, MAX_BIAS_M] → sem correcção.
    const tiny = { guincho: { waveBias: { region: 'Cascais', me: MIN_BIAS_M - 0.01, n: 120 } } };
    expect(resolveMorningRecalibration(spot, tiny, conditions, NOW)).toBeNull();
    const huge = { guincho: { waveBias: { region: 'Cascais', me: MAX_BIAS_M + 0.01, n: 120 } } };
    expect(resolveMorningRecalibration(spot, huge, conditions, NOW)).toBeNull();

    // viés que some no arredondamento (deltaM < 0.05) → sem correcção.
    const tinyDelta = { guincho: { waveBias: { region: 'Cascais', me: 0.02, n: 120 } } };
    expect(resolveMorningRecalibration(spot, tinyDelta, conditions, NOW)).toBeNull();
  });

  it('sem observedWave nem waveBias → previsão (null, sem recalibração)', () => {
    expect(resolveMorningRecalibration(spot, bestWindow, { guincho: {} }, NOW)).toBeNull();
    expect(resolveMorningRecalibration(spot, bestWindow, null, NOW)).toBeNull();
    expect(resolveMorningRecalibration(spot, bestWindow, { outro: {} }, NOW)).toBeNull();
    expect(resolveMorningRecalibration(spot, null, { guincho: {} }, NOW)).toBeNull();
  });

  it('respeita o gate de frescura por fonte (WMO 6h vs IH 3h)', () => {
    expect(MAX_AGE_HOURS).toEqual({ 'ih-buoy': 3, 'wmo-buoy': 6 });
    // WMO com 5h ainda fresca → «boia».
    const wmo = { guincho: { observedWave: freshReading({ source: 'wmo-buoy', observedAt: new Date(NOW - 5 * 3_600_000).toISOString() }) } };
    expect(resolveMorningRecalibration(spot, bestWindow, wmo, NOW)?.source).toBe('boia');
    // IH com 5h velha → sem boia.
    const ih = { guincho: { observedWave: freshReading({ observedAt: new Date(NOW - 5 * 3_600_000).toISOString() }) } };
    expect(resolveMorningRecalibration(spot, bestWindow, ih, NOW)).toBeNull();
  });

  it('suporta conditionsSource para spots alias', () => {
    const alias = { slug: 'alias-spot', region: 'Cascais', conditionsSource: 'guincho' };
    const conditions = { guincho: { observedWave: freshReading() } };
    expect(resolveMorningRecalibration(alias, bestWindow, conditions, NOW)?.source).toBe('boia');
  });
});
