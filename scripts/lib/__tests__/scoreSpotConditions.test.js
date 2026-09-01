import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeScore } = require('../scoreSpotConditions.js');

/**
 * computeScore (scoreSpotConditions.js) carrega o scoring TS real da web app
 * via tsx (getSportScore + rawToScoreInput + resolveScoreWaveSource). Estes
 * testes validam a RECALIBRAÇÃO do score tal como os scripts (alerts, dawn
 * patrol) a usam:
 *   - boia fresca no observedWave → a altura medida substitui a previsão →
 *     source 'observed' (o score é o da altura medida);
 *   - meta waveBias na row (correcção já aplicada pela pipeline) → source
 *     'bias-corrected' (o score usa a altura corrigida);
 *   - sem nenhum → source 'forecast' (controlo).
 */

const FRESH = new Date().toISOString();
const STALE = new Date(Date.now() - 12 * 3_600_000).toISOString();

/** Row mínima de conditions.json com a previsão 1.2 m / 9 s / vento fraco. */
function baseRow(overrides = {}) {
  return {
    waveHeight: 1.2,
    wavePeriod: 9.0,
    waveDirection: 280,
    windSpeed: 5.5,
    windDirection: 310,
    windGust: 8.0,
    waterTemp: 18,
    ...overrides,
  };
}

const SURF = 'surf';

describe('computeScore (scoreSpotConditions) — recalibração do score', () => {
  it('boia fresca: source "observed" e score = o da altura medida (não o da previsão)', () => {
    const buoy = {
      waveHeight: 2.8,
      wavePeriod: 12,
      waveDirection: 300,
      stationName: 'CSA92/D',
      stationArea: 'Leixões',
      distanceKm: 60,
      observedAt: FRESH,
      source: 'ih-buoy',
    };
    const withBuoy = computeScore('guincho', SURF, { guincho: baseRow({ observedWave: buoy }) });
    expect(withBuoy).not.toBeNull();
    expect(withBuoy.source).toBe('observed');

    // Controlos: previsão pura e previsão com os VALORES da boia.
    const forecastOnly = computeScore('guincho', SURF, { guincho: baseRow() });
    const asRaw = computeScore('guincho', SURF, {
      guincho: baseRow({ waveHeight: 2.8, wavePeriod: 12, waveDirection: 300 }),
    });

    // O score foi recalibrado: mudou face à previsão e coincide com o score
    // que a previsão teria se já trouxesse a altura medida.
    expect(withBuoy.score).not.toBe(forecastOnly.score);
    expect(withBuoy.score).toBe(asRaw.score);
  });

  it('waveBias na row (já corrigida pela pipeline): source "bias-corrected" com a altura corrigida', () => {
    // A pipeline (VENTU_WAVE_BIAS_CORRECTION=1) bakes a altura corrigida
    // (1.2 + 0.4 = 1.6) + o meta waveBias na row.
    const row = baseRow({
      waveHeight: 1.6,
      waveBias: { me: 0.4, n: 40, region: 'Cascais' },
    });
    const withBias = computeScore('guincho', SURF, { guincho: row });
    expect(withBias).not.toBeNull();
    expect(withBias.source).toBe('bias-corrected');

    const forecastOnly = computeScore('guincho', SURF, { guincho: baseRow() });
    const asRaw = computeScore('guincho', SURF, { guincho: baseRow({ waveHeight: 1.6 }) });

    // Score recalibrado: ≠ previsão pura e = previsão com a altura corrigida.
    expect(withBias.score).not.toBe(forecastOnly.score);
    expect(withBias.score).toBe(asRaw.score);
  });

  it('boia velha + waveBias → cai para "bias-corrected" (gate de frescura)', () => {
    const row = baseRow({
      waveHeight: 1.6,
      observedWave: {
        waveHeight: 2.8,
        observedAt: STALE,
        stationName: 'CSA92/D',
        distanceKm: 60,
        source: 'ih-buoy',
      },
      waveBias: { me: 0.4, n: 40, region: 'Cascais' },
    });
    const r = computeScore('guincho', SURF, { guincho: row });
    expect(r.source).toBe('bias-corrected');
    expect(r.score).toBe(
      computeScore('guincho', SURF, { guincho: baseRow({ waveHeight: 1.6 }) }).score,
    );
  });

  it('sem observedWave nem waveBias → source "forecast" (sem recalibração)', () => {
    const r = computeScore('guincho', SURF, { guincho: baseRow() });
    expect(r).not.toBeNull();
    expect(r.source).toBe('forecast');
    expect(r.score).toBe(
      computeScore('guincho', SURF, { guincho: baseRow({ waveHeight: 1.2 }) }).score,
    );
  });

  it('row ausente ou spot desconhecido → null (sem score inventado)', () => {
    expect(computeScore('guincho', SURF, {})).toBeNull();
    expect(computeScore('spot-inexistente', SURF, { 'spot-inexistente': baseRow() })).toBeNull();
  });
});
