/**
 * Alertas avaliados na HORA CORRENTE da previsão (forecasts/<id>.json) com as
 * observações frescas do conditions.json por cima — e sem avaliação de
 * condições de noite (sol < −0,8°). scripts/lib/scoreSpotConditions.js.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  computeScore,
  computeAlertScore,
  alertRowAt,
  isNightAtSpot,
  sunElevationAtSpot,
  makeForecastReader,
  NIGHT_SUN_ELEVATION_DEG,
} = require('../scoreSpotConditions.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KN = 1.94384;
// 17/10 14:00Z = 15:00 Lisboa (WEST)
const NOW_15H = Date.parse('2026-10-17T14:00:00Z');
const NOW_NOITE = Date.parse('2026-10-16T23:30:00Z');

const SNAPSHOT_CALMO = {
  waveHeight: 1.2, wavePeriod: 9, waveDirection: 300,
  windSpeed: 5 / KN, windDirection: 335, windGust: 7 / KN, waterTemp: 17.6,
  observedWave: { marker: 'fica' },
};
const HORAS = [
  { time: '2026-10-17T13:00', windSpeed: 12 / KN, windGust: 15 / KN, windDirection: 335, waveHeight: 1.2, wavePeriod: 9, waveDirection: 300 },
  { time: '2026-10-17T15:00', windSpeed: 20 / KN, windGust: 24 / KN, windDirection: 335, waveHeight: 1.2, wavePeriod: 9, waveDirection: 300, ens: { p10: 1 } },
];

describe('alertRowAt', () => {
  it('apanha a hora de Lisboa de nowMs e sobrepõe-na à linha do conditions (observações ficam)', () => {
    const { row, t, fromForecast } = alertRowAt(SNAPSHOT_CALMO, HORAS, NOW_15H);
    expect(fromForecast).toBe(true);
    expect(t).toBe('2026-10-17T15:00');
    expect(row.windSpeed).toBeCloseTo(20 / KN);
    expect(row.observedWave).toEqual({ marker: 'fica' });
    expect(row).not.toHaveProperty('ens');
    expect(row).not.toHaveProperty('time');
  });

  it('aceita etiquetas com desvio (fix/dados-dst-utc): os 13 primeiros caracteres mandam', () => {
    const horas = [{ ...HORAS[1], time: '2026-10-17T15:00+01:00' }];
    expect(alertRowAt(SNAPSHOT_CALMO, horas, NOW_15H).t).toBe('2026-10-17T15:00');
  });

  it('sem a hora corrente na previsão → a linha do conditions, tal como estava', () => {
    const r = alertRowAt(SNAPSHOT_CALMO, [HORAS[0]], NOW_15H);
    expect(r).toEqual({ row: SNAPSHOT_CALMO, t: undefined, fromForecast: false });
    expect(alertRowAt(SNAPSHOT_CALMO, null, NOW_15H).fromForecast).toBe(false);
  });
});

describe('computeAlertScore', () => {
  it('avalia a hora corrente da previsão, não a fotografia do último run', () => {
    const forecastFor = (id) => (id === 'guincho' ? HORAS : null);
    const r = computeAlertScore('guincho', 'kitesurf', { guincho: SNAPSHOT_CALMO }, { nowMs: NOW_15H, forecastFor });
    expect(r.fromForecast).toBe(true);
    expect(r.t).toBe('2026-10-17T15:00');
    expect(r.engine).toBe('v6');
    expect(r.nota).toBeGreaterThanOrEqual(7);
    // a fotografia calma (5 kt) à mesma hora não daria o alerta
    const snap = computeScore('guincho', 'kitesurf', { guincho: SNAPSHOT_CALMO }, { t: '2026-10-17T15:00' });
    expect(snap.nota).toBeLessThan(r.nota);
  });

  it('sem leitor de previsão → avalia a linha do conditions na hora de nowMs', () => {
    const r = computeAlertScore('guincho', 'kitesurf', { guincho: SNAPSHOT_CALMO }, { nowMs: NOW_15H });
    expect(r.fromForecast).toBe(false);
    expect(r.nota).toBe(computeScore('guincho', 'kitesurf', { guincho: SNAPSHOT_CALMO }, { nowMs: NOW_15H }).nota);
  });

  it('de noite (sol < −0,8°) não avalia condições', () => {
    expect(NIGHT_SUN_ELEVATION_DEG).toBe(-0.8);
    expect(isNightAtSpot('guincho', NOW_NOITE)).toBe(true);
    expect(isNightAtSpot('guincho', NOW_15H)).toBe(false);
    expect(computeAlertScore('guincho', 'kitesurf', { guincho: SNAPSHOT_CALMO }, { nowMs: NOW_NOITE, forecastFor: () => HORAS })).toEqual({ night: true });
    // também para desportos sem v6 (sup cai no motor antigo, que não sabe da noite)
    expect(computeAlertScore('guincho', 'sup', { guincho: SNAPSHOT_CALMO }, { nowMs: NOW_NOITE })).toEqual({ night: true });
  });

  it('o limiar é a elevação −0,8° (o disco abaixo do horizonte), não a hora', () => {
    // percorre o fim de tarde de 17/10 minuto a minuto: a noite começa onde a elevação cruza −0,8°
    let primeiro = null;
    for (let m = 0; m < 180; m++) {
      const ms = Date.parse('2026-10-17T17:00:00Z') + m * 60000;
      if (isNightAtSpot('guincho', ms)) {
        primeiro = ms;
        break;
      }
    }
    expect(primeiro).not.toBeNull();
    expect(sunElevationAtSpot('guincho', primeiro)).toBeLessThan(-0.8);
    expect(sunElevationAtSpot('guincho', primeiro - 60000)).toBeGreaterThanOrEqual(-0.8);
  });

  it('spot desconhecido ou sem linha → null', () => {
    expect(computeAlertScore('nao-existe', 'surf', {}, { nowMs: NOW_15H })).toBeNull();
    expect(computeAlertScore('guincho', 'surf', {}, { nowMs: NOW_15H })).toBeNull();
  });
});

describe('makeForecastReader', () => {
  it('lê forecasts/<id>.json, cai no forecasts.json agregado e guarda em cache', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcr-'));
    fs.mkdirSync(path.join(dir, 'forecasts'));
    fs.writeFileSync(path.join(dir, 'forecasts', 'guincho.json'), JSON.stringify(HORAS));
    fs.writeFileSync(path.join(dir, 'forecasts.json'), JSON.stringify({ carcavelos: [HORAS[0]] }));
    const read = makeForecastReader(dir);
    expect(read('guincho')).toHaveLength(2);
    expect(read('carcavelos')).toHaveLength(1);
    expect(read('nenhum')).toBeNull();
    fs.rmSync(path.join(dir, 'forecasts', 'guincho.json'));
    expect(read('guincho')).toHaveLength(2); // cache
  });
});
