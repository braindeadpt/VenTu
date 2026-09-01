import { describe, it, expect } from 'vitest';
import { spots } from '@/lib/spots';
import { getSportScore, SCORE_TIER_THRESHOLDS } from '@/lib/sportScore';
import {
  applyObservedWaveForScore,
  applyObservedWindForScore,
  applyRegionalBiasFallback,
  ktToMs,
  msToKt,
  rawToScoreInput,
  resolveRegionBias,
  resolveScoreWaveCorrection,
  resolveScoreWaveSource,
  resolveScoreWindCorrection,
  resolveScoreWindSource,
  waveFactorSuffix,
  WAVE_BIAS_MAX_M,
  WAVE_BIAS_MIN_M,
  WAVE_BIAS_MIN_N,
} from '@/lib/scoreConditions';
import type { ObservedConditions } from '@/lib/observations';
import type { ObservedWave } from '@/lib/observedWave';

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

  const freshWave = (hm0: number, period?: number, dir?: number): ObservedWave => ({
    waveHeight: hm0,
    wavePeriod: period,
    waveDirection: dir,
    maxWaveHeight: hm0 * 1.5,
    waterTemp: 18,
    stationName: 'CSA92/D',
    stationArea: 'Leixões',
    distanceKm: 60,
    observedAt: new Date().toISOString(),
    source: 'ih-buoy',
  });

  it('fresh buoy recalibrates the surf score via measured wave height', () => {
    const guincho = spotBySlug('guincho');
    // Forecast says tiny waves (0.6 m); buoy measured 1.8 m fresh.
    const forecast = {
      waveHeight: 0.6,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(10),
      windDirection: 300,
      windGust: ktToMs(14),
      waterTemp: 18,
    };
    const withObs = applyObservedWaveForScore(forecast, freshWave(1.8, 12, 280));
    const forecastScore = getSportScore(guincho, 'surf', forecast).score;
    const observedScore = getSportScore(guincho, 'surf', withObs).score;
    expect(observedScore).toBeGreaterThan(forecastScore);
    expect(withObs.waveHeight).toBe(1.8);
    expect(withObs.wavePeriod).toBe(12);
    expect(withObs.waveDirection).toBe(280);
  });

  it('keeps forecast fields when the buoy has no period/direction', () => {
    const base = {
      waveHeight: 1,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
    };
    const withObs = applyObservedWaveForScore(base, freshWave(1.4));
    expect(withObs.waveHeight).toBe(1.4);
    expect(withObs.wavePeriod).toBe(9);
    expect(withObs.waveDirection).toBe(270);
  });

  it('ignores stale observed wave', () => {
    const base = {
      waveHeight: 1,
      wavePeriod: 10,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
    };
    const stale: ObservedWave = {
      ...freshWave(2.0),
      observedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    };
    expect(applyObservedWaveForScore(base, stale)).toEqual(base);
    expect(applyObservedWaveForScore(base, null)).toEqual(base);
  });

  it('rawToScoreInput recalibrates waves from observedWave in the JSON', () => {
    const guincho = spotBySlug('guincho');
    const raw = {
      waveHeight: 0.6,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(10),
      windDirection: 300,
      windGust: ktToMs(14),
      waterTemp: 18,
      observedWave: freshWave(1.8, 12, 280),
    };
    const scoreInput = rawToScoreInput(raw);
    expect(scoreInput.waveHeight).toBe(1.8);
    expect(scoreInput.wavePeriod).toBe(12);
    expect(resolveScoreWaveSource(raw)).toBe('observed');
    expect(getSportScore(guincho, 'surf', scoreInput).score).toBeGreaterThan(
      getSportScore(guincho, 'surf', {
        waveHeight: 0.6,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(10),
        windDirection: 300,
        windGust: ktToMs(14),
        waterTemp: 18,
      }).score,
    );
  });

  it('resolveScoreWaveSource: stale or missing buoy → forecast', () => {
    const raw = {
      waveHeight: 1,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
    };
    expect(resolveScoreWaveSource(raw)).toBe('forecast');
    expect(
      resolveScoreWaveSource({
        ...raw,
        observedWave: {
          ...freshWave(1.5),
          observedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
        },
      }),
    ).toBe('forecast');
  });

  it('resolveScoreWaveSource: regional bias meta → bias-corrected', () => {
    const raw = {
      waveHeight: 1.3,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
      waveBias: { region: 'Porto', me: 0.4, n: 86, deltaM: 0.4 },
    };
    expect(resolveScoreWaveSource(raw)).toBe('bias-corrected');
  });

  it('resolveScoreWaveSource: fresh buoy wins over bias meta', () => {
    const raw = {
      waveHeight: 1.3,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
      waveBias: { region: 'Porto', me: 0.4, n: 86, deltaM: 0.4 },
      observedWave: freshWave(1.8, 12, 280),
    };
    expect(resolveScoreWaveSource(raw)).toBe('observed');
  });

  it('resolveScoreWaveCorrection: fresh buoy with per-buoy skill (ME/n)', () => {
    const raw = {
      waveHeight: 0.6,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(10),
      windDirection: 300,
      windGust: ktToMs(14),
      waterTemp: 18,
      observedWave: {
        ...freshWave(1.8, 12, 280),
        skill: { me: 0.2, n: 47 },
      },
    };
    const corr = resolveScoreWaveCorrection(raw);
    expect(corr).toMatchObject({
      source: 'observed',
      buoyName: 'CSA92/D',
      me: 0.2,
      n: 47,
    });
  });

  it('resolveScoreWaveCorrection: fresh buoy without skill → no ME/n', () => {
    const corr = resolveScoreWaveCorrection({
      waveHeight: 0.6,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(10),
      windDirection: 300,
      windGust: ktToMs(14),
      waterTemp: 18,
      observedWave: freshWave(1.8),
    });
    expect(corr?.source).toBe('observed');
    expect(corr?.buoyName).toBe('CSA92/D');
    expect(corr?.me).toBeUndefined();
    expect(corr?.n).toBeUndefined();
  });

  it('resolveScoreWaveCorrection: WMO ES buoy with cross-border calibration surfaces ME/n + raw/delta', () => {
    const corr = resolveScoreWaveCorrection({
      waveHeight: 1.4,
      wavePeriod: 10,
      waveDirection: 280,
      windSpeed: ktToMs(10),
      windDirection: 300,
      windGust: ktToMs(14),
      waterTemp: 18,
      observedWave: {
        ...freshWave(1.4, 10, 280),
        source: 'wmo-buoy' as const,
        stationName: 'Cabo Silleiro',
        stationArea: 'Galiza',
        distanceKm: 96.8,
        calibration: {
          me: -0.9,
          n: 4,
          verdict: 'review',
          from: 'Cabo Silleiro × Datawell ao largo de Faro',
          rawHeight: 2.3,
          deltaM: -0.9,
        },
      },
    });
    expect(corr).toMatchObject({
      source: 'observed',
      buoyName: 'Cabo Silleiro',
      calibration: {
        me: -0.9,
        n: 4,
        rawHeight: 2.3,
        deltaM: -0.9,
      },
    });
    // Sem skill per-buoy → me/n de topo ausentes (só a calibração)
    expect(corr?.me).toBeUndefined();
    expect(corr?.n).toBeUndefined();
  });

  it('resolveScoreWaveCorrection: regional bias meta exposes ME/n/deltaM (pipeline, sem fallback)', () => {
    const corr = resolveScoreWaveCorrection({
      waveHeight: 1.3,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
      waveBias: { region: 'Porto', me: 0.4, n: 86, deltaM: 0.4 },
    });
    expect(corr).toMatchObject({
      source: 'bias-corrected',
      me: 0.4,
      n: 86,
      deltaM: 0.4,
    });
    // Meta baked pela pipeline não carrega `fallback` — o tooltip distingue.
    expect(corr?.fallback).toBeUndefined();
  });

  it('resolveScoreWaveCorrection: meta do fallback client-side expõe fallback:true + deltaM', () => {
    const corr = resolveScoreWaveCorrection({
      waveHeight: 1.8,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 270,
      windGust: ktToMs(10),
      waterTemp: 18,
      waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3, fallback: true },
    });
    expect(corr).toMatchObject({
      source: 'bias-corrected',
      me: 0.3,
      n: 120,
      deltaM: 0.3,
      fallback: true,
    });
  });

  it('resolveScoreWaveCorrection: raw forecast → null', () => {
    expect(
      resolveScoreWaveCorrection({
        waveHeight: 1,
        wavePeriod: 9,
        waveDirection: 270,
        windSpeed: ktToMs(8),
        windDirection: 270,
        windGust: ktToMs(10),
        waterTemp: 18,
      }),
    ).toBeNull();
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

  it('rawToScoreInput accepts METAR observed source', () => {
    const guincho = spotBySlug('guincho');
    const raw = {
      waveHeight: 0.8,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(7),
      windDirection: 270,
      windGust: ktToMs(9),
      waterTemp: 18,
      observed: {
        ...freshObserved(16, 330),
        source: 'metar' as const,
        stationName: 'Cascais (METAR)',
      },
    };
    expect(resolveScoreWindSource(raw)).toBe('observed');
    expect(getSportScore(guincho, 'kitesurf', rawToScoreInput(raw)).score).toBeGreaterThan(60);
  });

  it('resolveScoreWindCorrection: station windBias meta expõe ME/n/MAE/RMSE', () => {
    const corr = resolveScoreWindCorrection({
      waveHeight: 0.8,
      wavePeriod: 9,
      waveDirection: 270,
      windSpeed: ktToMs(7),
      windDirection: 270,
      windGust: ktToMs(9),
      waterTemp: 18,
      observed: freshObserved(16, 337),
      windBias: {
        station: 'Cascais',
        source: 'ipma',
        me: 2.1,
        mae: 3.4,
        rmse: 4.2,
        n: 340,
      },
    });
    expect(corr).toMatchObject({
      station: 'Cascais',
      source: 'ipma',
      me: 2.1,
      mae: 3.4,
      rmse: 4.2,
      n: 340,
    });
  });

  it('resolveScoreWindCorrection: sem windBias (ou sem me/n finitos) → null', () => {
    expect(
      resolveScoreWindCorrection({
        waveHeight: 0.8,
        wavePeriod: 9,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        observed: freshObserved(16, 337),
      }),
    ).toBeNull();
    expect(
      resolveScoreWindCorrection({
        waveHeight: 0.8,
        windSpeed: ktToMs(7),
        windBias: { station: 'Cascais', me: 'nope', n: 'nope' },
      }),
    ).toBeNull();
  });

  it('gust session proxy lifts Caparica-style mean≪gust without inventing wind', () => {
    const nova = spotBySlug('nova-vaga');
    const raw = {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 315,
      windGust: ktToMs(20),
      waterTemp: 18,
    };
    const forecastOnly = getSportScore(nova, 'kitesurf', {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(8),
      windDirection: 315,
      windGust: ktToMs(20),
      waterTemp: 18,
    }).score;
    const withProxy = getSportScore(nova, 'kitesurf', rawToScoreInput(raw)).score;
    expect(withProxy).toBeGreaterThan(forecastOnly);
    expect(withProxy).toBeGreaterThanOrEqual(SCORE_TIER_THRESHOLDS.fair);
    expect(resolveScoreWindSource(raw)).toBe('session-gust');
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

describe('waveFactorSuffix (factor do score honesto)', () => {
  it('anexa «(boia)» quando a medição fresca entrou no score', () => {
    expect(waveFactorSuffix('observed', 'pt')).toBe(' (boia)');
    expect(waveFactorSuffix('observed', 'en')).toBe(' (buoy)');
  });

  it('anexa «(viés regional)» no fallback, nada na previsão', () => {
    expect(waveFactorSuffix('bias-corrected', 'pt')).toBe(' (viés regional)');
    expect(waveFactorSuffix('bias-corrected', 'en')).toBe(' (regional bias)');
    expect(waveFactorSuffix('forecast', 'pt')).toBe('');
    expect(waveFactorSuffix('forecast', 'en')).toBe('');
  });
});

describe('viés regional como fallback (wave-bias.json)', () => {
  const file = (region: string, overrides: Record<string, unknown> = {}) => ({
    regions: {
      [region]: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5, ...overrides },
    },
  });

  it('resolveRegionBias devolve as stats da região com os gates da pipeline', () => {
    expect(resolveRegionBias('Cascais', file('Cascais'))).toEqual({
      region: 'Cascais',
      me: 0.3,
      n: 120,
      mae: 0.4,
      rmse: 0.5,
    });
  });

  it('resolveRegionBias: null sem região/ficheiro/região no ficheiro', () => {
    expect(resolveRegionBias(undefined, file('Cascais'))).toBeNull();
    expect(resolveRegionBias('Cascais', null)).toBeNull();
    expect(resolveRegionBias('Cascais', {})).toBeNull();
    expect(resolveRegionBias('Cascais', { regions: { Lisboa: { n: 120, me: 0.3 } } })).toBeNull();
  });

  it('resolveRegionBias: gate de amostra (n ≥ 30) e de magnitude (|ME| em [0.15, 1.5])', () => {
    expect(resolveRegionBias('Cascais', file('Cascais', { n: WAVE_BIAS_MIN_N - 1 }))).toBeNull();
    expect(resolveRegionBias('Cascais', file('Cascais', { me: WAVE_BIAS_MIN_M - 0.01 }))).toBeNull();
    expect(resolveRegionBias('Cascais', file('Cascais', { me: WAVE_BIAS_MAX_M + 0.01 }))).toBeNull();
    expect(resolveRegionBias('Cascais', file('Cascais', { me: 'x' }))).toBeNull();
  });

  it('applyRegionalBiasFallback corrige a altura e anexa o meta com fallback:true (mesma aritmética da pipeline)', () => {
    const patch = applyRegionalBiasFallback({ waveHeight: 1.5 }, 'Cascais', file('Cascais'));
    expect(patch).toEqual({
      waveHeight: 1.8,
      waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3, fallback: true },
    });
    // Arredondamento idêntico ao buoyBias.applyWaveBias: round1(raw + me).
    expect(applyRegionalBiasFallback({ waveHeight: 1.46 }, 'Cascais', file('Cascais'))).toEqual({
      waveHeight: 1.8,
      waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3, fallback: true },
    });
    // Piso 0.1 para alturas negativas após a correcção (round1(0.05+1.2)=1.3).
    const low = applyRegionalBiasFallback({ waveHeight: 0.05 }, 'Cascais', file('Cascais', { me: 1.2 }));
    expect(low?.waveHeight).toBe(1.3);
  });

  it('applyRegionalBiasFallback: leitura fresca ganha — nunca aplica o viés', () => {
    const fresh = {
      waveHeight: 1.5,
      observedWave: {
        waveHeight: 2.2,
        stationName: 'CSA92/D',
        distanceKm: 60,
        observedAt: new Date().toISOString(),
        source: 'ih-buoy',
      } as ObservedWave,
    };
    expect(applyRegionalBiasFallback(fresh, 'Cascais', file('Cascais'))).toBeNull();
    // Leitura velha → fallback aplica-se.
    const stale = {
      waveHeight: 1.5,
      observedWave: {
        waveHeight: 2.2,
        stationName: 'CSA92/D',
        distanceKm: 60,
        observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
        source: 'ih-buoy',
      } as ObservedWave,
    };
    expect(applyRegionalBiasFallback(stale, 'Cascais', file('Cascais'))?.waveHeight).toBe(1.8);
  });

  it('applyRegionalBiasFallback: row já corrigida pela pipeline não é corrigida duas vezes', () => {
    const row = {
      waveHeight: 1.8,
      waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
    };
    expect(applyRegionalBiasFallback(row, 'Cascais', file('Cascais'))).toBeNull();
  });

  it('applyRegionalBiasFallback: sem região com viés ou delta irrisório → null', () => {
    expect(applyRegionalBiasFallback({ waveHeight: 1.5 }, 'Lisboa', file('Cascais'))).toBeNull();
    expect(applyRegionalBiasFallback({ waveHeight: 1.5 }, undefined, file('Cascais'))).toBeNull();
    // Viés que some no arredondamento (deltaM < 0.05) não é reportado.
    expect(applyRegionalBiasFallback({ waveHeight: 1.52 }, 'Cascais', file('Cascais', { me: 0.02 }))).toBeNull();
    expect(applyRegionalBiasFallback({ waveHeight: 'x' }, 'Cascais', file('Cascais'))).toBeNull();
  });

  it('rawToScoreInput + resolveScoreWaveSource: fallback vira bias-corrected na row patcheada', () => {
    const row = { waveHeight: 1.5, wavePeriod: 8, windSpeed: 5, windGust: 7, windDirection: 270, waterTemp: 18 };
    const patch = applyRegionalBiasFallback(row, 'Cascais', file('Cascais'))!;
    const effective = { ...row, ...patch };
    expect(resolveScoreWaveSource(effective)).toBe('bias-corrected');
    const corr = resolveScoreWaveCorrection(effective);
    expect(corr?.source).toBe('bias-corrected');
    expect(corr?.me).toBe(0.3);
    expect(corr?.n).toBe(120);
    expect(corr?.deltaM).toBe(0.3);
    expect(rawToScoreInput(effective).waveHeight).toBe(1.8);
  });
});
