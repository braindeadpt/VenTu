import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeScore: computeScoreAt } = require('../scoreSpotConditions.js');

/**
 * O motor v6 não dá nota de noite: estes testes de recalibração avaliam a
 * linha ao meio-dia de Lisboa (a frescura da boia continua contra o relógio real).
 */
const DIA = { t: '2026-10-16T12:00' };
const computeScore = (id, sport, c) => computeScoreAt(id, sport, c, DIA);

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
      distanceKm: 30,
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
        distanceKm: 30,
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

/**
 * Auditoria de dados 16/10 (C1, #218): os alertas usavam o `sportScore` com o
 * *gust proxy* e davam 10/10 ao kite com 7 kt de média e 22 kt de rajada.
 * Valores reais do forecast live de 16/10 (m/s, como o pipeline guarda).
 */
describe('computeScore — motor v6 nos alertas (auditoria 16/10)', () => {
  const KITE = 'kitesurf';

  it('Vila Praia de Âncora 16/10 12h, 7/22 kt de N: não é Bom (antes 10/10)', () => {
    const row = {
      waveHeight: 1.8,
      wavePeriod: 10.85,
      waveDirection: 299,
      windSpeed: 3.57, // 7 kt
      windDirection: 342,
      windGust: 11.4, // 22 kt
      waterTemp: 15.5,
      tideHeight: -1.23,
    };
    const r = computeScoreAt('vila-praia-ancora', KITE, { 'vila-praia-ancora': row }, { t: '2026-10-16T12:00' });
    expect(r).not.toBeNull();
    expect(r.engine).toBe('v6');
    expect(r.nota).toBeLessThan(7);
    expect(r.nota).toBe(0);
  });

  it('Vila Praia de Âncora 16/10 17h, 8/30 kt: continua a não dar', () => {
    const row = {
      waveHeight: 1.8, wavePeriod: 10, waveDirection: 299,
      windSpeed: 8 / 1.94384, windDirection: 340, windGust: 30 / 1.94384, waterTemp: 15.5,
    };
    const r = computeScoreAt('vila-praia-ancora', KITE, { 'vila-praia-ancora': row }, { t: '2026-10-16T17:00' });
    expect(r.nota).toBeLessThan(5);
  });

  it('Carcavelos 16/10 18h com nortada (12/25 kt de 349°, offshore real): tecto de segurança, não é Bom', () => {
    const row = {
      waveHeight: 1.74, wavePeriod: 10.7, waveDirection: 306,
      windSpeed: 6, windDirection: 349, windGust: 13, waterTemp: 18.1, tideHeight: 0.18,
    };
    const r = computeScoreAt('carcavelos', KITE, { carcavelos: row }, { t: '2026-10-16T18:00' });
    expect(r).not.toBeNull();
    expect(r.engine).toBe('v6');
    expect(r.nota).toBeLessThanOrEqual(3);
  });

  it('Carcavelos com nortada forte e estável (20/24 kt de N): continua offshore, nunca Bom', () => {
    const row = {
      waveHeight: 0.8, wavePeriod: 8, waveDirection: 250,
      windSpeed: 20 / 1.94384, windDirection: 355, windGust: 24 / 1.94384, waterTemp: 18,
    };
    const r = computeScoreAt('carcavelos', KITE, { carcavelos: row }, { t: '2026-10-16T15:00' });
    expect(r.nota).toBeLessThanOrEqual(3);
  });

  it('Guincho 17/10 15h, 20/24 kt de NNW (lateral de mar): o v6 dá Bom — o alerta continua a disparar quando deve', () => {
    const row = {
      waveHeight: 1.2, wavePeriod: 9, waveDirection: 300,
      windSpeed: 20 / 1.94384, windDirection: 335, windGust: 24 / 1.94384, waterTemp: 17.6,
    };
    const r = computeScoreAt('guincho', KITE, { guincho: row }, { t: '2026-10-17T15:00' });
    expect(r.engine).toBe('v6');
    expect(r.nota).toBeGreaterThanOrEqual(7);
    expect(r.score).toBe(r.nota * 10);
  });

  it('de noite não há nota: null (o alerta não dispara)', () => {
    const row = {
      waveHeight: 1.2, wavePeriod: 9, waveDirection: 300,
      windSpeed: 20 / 1.94384, windDirection: 335, windGust: 24 / 1.94384, waterTemp: 17.6,
    };
    expect(computeScoreAt('guincho', KITE, { guincho: row }, { t: '2026-10-16T23:00' })).toBeNull();
    expect(computeScoreAt('guincho', 'surf', { guincho: row }, { t: '2026-10-16T03:00' })).toBeNull();
  });
});
