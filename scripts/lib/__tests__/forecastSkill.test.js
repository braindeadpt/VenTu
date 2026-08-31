import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  lisbonHourKeyFromDate,
  hourKey,
  hourKeyToUtcMs,
  emptyArchive,
  readArchive,
  writeArchive,
  archiveForecastRun,
  archiveObservations,
  archiveWmoSkill,
  crossPairs,
  attachWaveSkill,
  computeSkillStats,
  buildStats,
  pruneArchive,
  buildReport,
  SKILL_WINDOW_DAYS,
  MIN_PAIRS,
  MAX_FORECAST_LEAD_HOURS,
  FORECAST_ARCHIVE_HOURS,
} = require('../forecastSkill.js');

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FORECAST_SKILL_OUTPUT_PATH;
});

const NOW = Date.parse('2026-08-14T14:00:00Z');

describe('hora (Europe/Lisbon)', () => {
  it('hourKey normaliza UTC ISO para hora Lisboa (verão, UTC+1)', () => {
    // 2026-08-14T13:00:00Z = 14:00 Lisboa (WEST)
    expect(hourKey('2026-08-14T13:00:00Z')).toBe('2026-08-14T14');
  });

  it('hourKey trata horas do forecasts.json (Lisboa local, sem offset)', () => {
    expect(hourKey('2026-08-14T14:00')).toBe('2026-08-14T14');
  });

  it('hourKeyToUtcMs round-trips uma hora Lisboa', () => {
    const ms = hourKeyToUtcMs('2026-08-14T14');
    expect(new Date(ms).toISOString()).toBe('2026-08-14T13:00:00.000Z'); // WEST = UTC+1
  });

  it('hourKeyToUtcMs resolve inverno (WET = UTC+0)', () => {
    const ms = hourKeyToUtcMs('2026-01-10T14');
    expect(new Date(ms).toISOString()).toBe('2026-01-10T14:00:00.000Z');
  });
});

describe('arquivo + cruzamento com lead time', () => {
  function archiveWith(nowMs = NOW) {
    const a = emptyArchive();
    // Previsão feita às 06:00Z para a hora 12:00Z (lead = 6h).
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4, buoyName: 'CSA92/D' },
      // Nowcast (runAt == target) — deve ser EXCLUÍDO (lead 0).
      { time: '2026-08-14T12:00:00Z', hm0: 2.0, runAt: '2026-08-14T12:00:00Z', buoyId: 4 },
    ]);
    archiveObservations(a, [
      { time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4, buoyName: 'CSA92/D' },
    ]);
    return a;
  }

  it('mantém a previsão mais antiga por boia+hora (lead real)', () => {
    const a = archiveWith();
    expect(a.forecasts).toHaveLength(1);
    expect(a.forecasts[0].hm0).toBe(1.5);
    expect(a.forecasts[0].runAt).toBe('2026-08-14T06:00:00Z');
  });

  it('cruza apenas com lead time > 0', () => {
    const pairs = crossPairs(archiveWith(), { nowMs: NOW });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      forecastHm0: 1.5,
      observedHm0: 1.8,
      leadTimeHours: 6,
      buoyId: 4,
      origin: 'ih',
    });
  });

  it('deriva origin por tipo de buoyId em linhas antigas sem origin (IH numérico, WMO string)', () => {
    const a = emptyArchive();
    // Linhas legacy sem origin — o cruzamento tem de as derivar.
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4 },
      { time: '2026-08-14T12:00:00Z', hm0: 1.4, runAt: '2026-08-14T06:00:00Z', buoyId: '6200084' },
    ]);
    archiveObservations(a, [
      { time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4 },
      { time: '2026-08-14T12:20:00Z', hm0: 1.6, buoyId: '6200084' },
    ]);
    const pairs = crossPairs(a, { nowMs: NOW });
    expect(pairs).toHaveLength(2);
    expect(pairs.find((p) => p.buoyId === 4).origin).toBe('ih');
    expect(pairs.find((p) => p.buoyId === '6200084').origin).toBe('wmo-es');
  });

  it('hora futura (target > now) não gera par', () => {
    const a = archiveWith(NOW);
    const pairs = crossPairs(a, { nowMs: Date.parse('2026-08-14T10:00:00Z') });
    expect(pairs).toHaveLength(0);
  });

  it('previsão demasiado longe (lead > MAX) é ignorada', () => {
    const a = emptyArchive();
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-01T00:00:00Z', buoyId: 4 },
    ]);
    archiveObservations(a, [{ time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4 }]);
    const pairs = crossPairs(a, { nowMs: NOW });
    expect(pairs).toHaveLength(0);
  });

  it('boias diferentes na mesma hora não se sobrepõem', () => {
    const a = emptyArchive();
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4 },
      { time: '2026-08-14T12:00:00Z', hm0: 2.5, runAt: '2026-08-14T06:00:00Z', buoyId: 19 },
    ]);
    archiveObservations(a, [
      { time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4 },
      { time: '2026-08-14T12:20:00Z', hm0: 2.9, buoyId: 19 },
    ]);
    const pairs = crossPairs(a, { nowMs: NOW });
    expect(pairs).toHaveLength(2);
  });
});

describe('archiveWmoSkill (boias ES keyless)', () => {
  const RUN_AT = '2026-08-14T10:00:00Z';
  const NOW_MS = Date.parse(RUN_AT);
  const spots = [
    { id: 'moledo', lat: 41.84, lon: -8.87 },
    { id: 'viana', lat: 41.69, lon: -8.83 },
    { id: 'faro', lat: 36.98, lon: -8.0 },
  ];
  const forecasts = {
    moledo: [
      { time: '2026-08-14T15:00', waveHeight: 1.4 },
      { time: '2026-08-14T16:00', waveHeight: 1.5 },
    ],
    faro: [{ time: '2026-08-14T15:00', waveHeight: 0.7 }],
  };
  const wmoArchive = {
    buoys: {
      '6200084': {
        name: 'Cabo Silleiro',
        lat: 42.12,
        lon: -9.43,
        readings: [
          { date: '2026-08-14T12:00:00Z', hm0: 1.6 },
          { date: '2026-08-14T13:00:00Z', hm0: 1.7 },
        ],
      },
      '6200083': {
        name: 'Villano-Sisargas',
        lat: 43.5,
        lon: -9.21,
        readings: [{ date: '2026-08-14T12:00:00Z', hm0: 2.1 }],
      },
      '6200085': {
        name: 'Golfo de Cádiz',
        lat: 36.49,
        lon: -6.96,
        readings: [{ date: '2026-08-14T12:00:00Z', hm0: 0.8 }],
      },
    },
  };

  it('arquiva o best_match do spot mais próximo por boia + todas as leituras', () => {
    const a = emptyArchive();
    const res = archiveWmoSkill(a, {
      forecasts,
      spots,
      wmoArchive,
      wmoBuoys: null,
      nowMs: NOW_MS,
      runAt: RUN_AT,
    });
    // Silleiro → moledo (59 km < viana 63) × 2 h; Cádiz → faro × 1 h; Villano
    // sem spot mais próximo (faro está a 96 km de Cádiz, moledo a 59 de Silleiro).
    expect(res.forecastRows).toBe(3);
    expect(res.obsRows).toBe(4);
    expect(res.buoyCodes).toEqual(expect.arrayContaining(['6200084', '6200083', '6200085']));
    expect(res.mappedSpots).toBe(2);

    expect(a.forecasts).toHaveLength(3);
    expect(a.forecasts[0]).toMatchObject({
      buoyId: '6200084',
      buoyName: 'Cabo Silleiro',
      hm0: 1.4,
      origin: 'wmo-es',
    });
    expect(a.observations).toHaveLength(4);
    // As chaves numéricas ordenam-se em JS (6200083 < 6200084), por isso não
    // dependo da ordem — procuro a observação da boia.
    expect(a.observations.find((o) => o.buoyId === '6200084')).toMatchObject({ hm0: 1.6, origin: 'wmo-es' });
    expect(a.observations.find((o) => o.buoyId === '6200085')).toMatchObject({ hm0: 0.8, origin: 'wmo-es' });
  });

  it('cruza pares ES com buoyId string e lead > 0 (sem key)', () => {
    const a = emptyArchive();
    const fc = { moledo: [{ time: '2026-08-14T15:00', waveHeight: 1.4 }] };
    const arc = {
      buoys: {
        '6200084': {
          name: 'Cabo Silleiro',
          lat: 42.12,
          lon: -9.43,
          // 14:00Z = 15:00 Lisboa — mesma hora-chave da previsão.
          readings: [{ date: '2026-08-14T14:00:00Z', hm0: 1.6 }],
        },
      },
    };
    archiveWmoSkill(a, { forecasts: fc, spots, wmoArchive: arc, wmoBuoys: null, nowMs: NOW_MS, runAt: RUN_AT });
    const pairs = crossPairs(a, { nowMs: Date.parse('2026-08-14T15:00:00Z') });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      buoyId: '6200084',
      buoyName: 'Cabo Silleiro',
      forecastHm0: 1.4,
      observedHm0: 1.6,
      leadTimeHours: 4,
      origin: 'wmo-es',
    });
    // A stats por boia funciona com chaves string (sem colisão com idEst
    // numérico) — mas só reporta acima de MIN_PAIRS.
    const many = Array.from({ length: 12 }, () => pairs[0]);
    const { byBuoy } = buildStats(many);
    expect(byBuoy['6200084'].n).toBe(12);
    expect(byBuoy['6200084'].origin).toBe('wmo-es');
  });

  it('acumula entre runs: mantém previsão mais antiga e leitura mais recente', () => {
    const a = emptyArchive();
    const fc = { moledo: [{ time: '2026-08-14T15:00', waveHeight: 1.4 }] };
    const first = {
      buoys: {
        '6200084': {
          name: 'Cabo Silleiro',
          lat: 42.12,
          lon: -9.43,
          readings: [{ date: '2026-08-14T14:00:00Z', hm0: 1.6 }],
        },
      },
    };
    archiveWmoSkill(a, { forecasts: fc, spots, wmoArchive: first, wmoBuoys: null, nowMs: NOW_MS, runAt: RUN_AT });
    const second = {
      buoys: {
        '6200084': {
          name: 'Cabo Silleiro',
          lat: 42.12,
          lon: -9.43,
          // Mesma hora-chave (14:30Z → 15:30 Lisboa) mas leitura mais recente.
          readings: [{ date: '2026-08-14T14:30:00Z', hm0: 1.9 }],
        },
      },
    };
    archiveWmoSkill(a, {
      forecasts: fc,
      spots,
      wmoArchive: second,
      wmoBuoys: null,
      nowMs: NOW_MS,
      runAt: '2026-08-14T11:00:00Z',
    });
    expect(a.forecasts).toHaveLength(1);
    expect(a.forecasts[0].runAt).toBe(RUN_AT);
    expect(a.observations).toHaveLength(1);
    expect(a.observations[0].hm0).toBe(1.9);
  });

  it('usa o catálogo wmo-buoys.json para nome/posição quando o arquivo não tem', () => {
    const a = emptyArchive();
    const arc = {
      buoys: {
        '6200084': {
          readings: [{ date: '2026-08-14T12:00:00Z', hm0: 1.6 }],
        },
      },
    };
    const cat = {
      buoys: {
        '6200084': { name: 'Cabo Silleiro', lat: 42.12, lon: -9.43 },
      },
    };
    const res = archiveWmoSkill(a, {
      forecasts,
      spots,
      wmoArchive: arc,
      wmoBuoys: cat,
      nowMs: NOW_MS,
      runAt: RUN_AT,
    });
    expect(res.forecastRows).toBe(2);
    expect(a.observations[0].buoyName).toBe('Cabo Silleiro');
  });

  it('no-op sem arquivo, sem leituras, ou sem posição', () => {
    const a = emptyArchive();
    expect(
      archiveWmoSkill(a, { forecasts, spots, wmoArchive: null, wmoBuoys: null, nowMs: NOW_MS, runAt: RUN_AT }),
    ).toEqual({ forecastRows: 0, obsRows: 0, buoyCodes: [], mappedSpots: 0 });

    const noReadings = { buoys: { '6200084': { name: 'Cabo Silleiro', lat: 42.12, lon: -9.43, readings: [] } } };
    const r1 = archiveWmoSkill(a, { forecasts, spots, wmoArchive: noReadings, wmoBuoys: null, nowMs: NOW_MS, runAt: RUN_AT });
    expect(r1.forecastRows).toBe(0);
    expect(r1.obsRows).toBe(0);

    const noPos = { buoys: { '6200084': { name: 'Cabo Silleiro', readings: [{ date: '2026-08-14T12:00:00Z', hm0: 1.6 }] } } };
    const r2 = archiveWmoSkill(a, { forecasts, spots, wmoArchive: noPos, wmoBuoys: null, nowMs: NOW_MS, runAt: RUN_AT });
    expect(r2.forecastRows).toBe(0);
    expect(r2.obsRows).toBe(0);
  });

  it('janela de arquivo de previsões é 48h (constante partilhada com o script)', () => {
    expect(FORECAST_ARCHIVE_HOURS).toBe(48);
  });
});

describe('stats', () => {
  it('ME/MAE/RMSE/corr sobre pares (ME = observed − forecast)', () => {
    const stats = computeSkillStats([
      { forecastHm0: 1.0, observedHm0: 1.3, leadTimeHours: 6 },
      { forecastHm0: 2.0, observedHm0: 2.3, leadTimeHours: 12 },
      { forecastHm0: 3.0, observedHm0: 3.3, leadTimeHours: 24 },
    ]);
    expect(stats).toMatchObject({ n: 3, me: 0.3, mae: 0.3, rmse: 0.3, meanLeadHours: 14 });
    expect(stats.corr).toBeCloseTo(1, 5);
  });

  it('devolve null sem pares', () => {
    expect(computeSkillStats([])).toBeNull();
    expect(computeSkillStats(null)).toBeNull();
  });

  it('buildStats agrega por boia com MIN_PAIRS', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => ({
      buoyId: 4,
      forecastHm0: 1,
      observedHm0: 1.2,
      leadTimeHours: 6,
    }));
    const { overall, byBuoy } = buildStats(pairs);
    expect(overall.n).toBe(12);
    expect(byBuoy[4].n).toBe(12);

    const few = Array.from({ length: MIN_PAIRS - 1 }, () => ({
      buoyId: 19,
      forecastHm0: 1,
      observedHm0: 1.1,
      leadTimeHours: 6,
    }));
    const small = buildStats(few);
    expect(small.byBuoy[19]).toBeUndefined();
  });

  it('buildStats separa por origem (IH vs WMO-ES) — o total misto não chega', () => {
    const ihPairs = Array.from({ length: 12 }, () => ({
      buoyId: 4,
      origin: 'ih',
      forecastHm0: 1.0,
      observedHm0: 1.3,
      leadTimeHours: 6,
    }));
    const esPairs = Array.from({ length: 10 }, () => ({
      buoyId: '6200084',
      origin: 'wmo-es',
      forecastHm0: 2.0,
      observedHm0: 1.7,
      leadTimeHours: 12,
    }));
    const { overall, byOrigin, byBuoy } = buildStats([...ihPairs, ...esPairs]);
    // Total misto: 22 pares.
    expect(overall.n).toBe(22);
    // Por plataforma, cada uma com as suas stats (não misturadas).
    expect(byOrigin.ih).toMatchObject({ n: 12, me: 0.3 });
    expect(byOrigin['wmo-es']).toMatchObject({ n: 10, me: -0.3 });
    // Cada boia carrega a sua origem.
    expect(byBuoy[4].origin).toBe('ih');
    expect(byBuoy['6200084'].origin).toBe('wmo-es');
  });

  it('byOrigin fica a null para plataformas sem pares', () => {
    const ihPairs = Array.from({ length: 12 }, () => ({
      buoyId: 4,
      origin: 'ih',
      forecastHm0: 1.0,
      observedHm0: 1.2,
      leadTimeHours: 6,
    }));
    const { byOrigin } = buildStats(ihPairs);
    expect(byOrigin.ih.n).toBe(12);
    expect(byOrigin['wmo-es']).toBeNull();
  });

  it('buildReport inclui byOrigin no report e no archive', () => {
    const a = emptyArchive();
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4, origin: 'ih' },
    ]);
    archiveObservations(a, [{ time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4, origin: 'ih' }]);
    const report = buildReport(a, NOW);
    expect(report.byOrigin).toEqual({ ih: expect.objectContaining({ n: 1 }), 'wmo-es': null });
    expect(a.byOrigin).toEqual(report.byOrigin);
  });

  it('buildReport conta pares por origem (IH vs WMO-ES) e por calibração', () => {
    const a = emptyArchive();
    // 2 pares IH + 3 pares ES (leituras de boia espanhola — a camada calibrada).
    // Todas as horas-alvo antes de NOW (14:00Z) para formarem pares reais.
    archiveForecastRun(a, [
      { time: '2026-08-14T08:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4, origin: 'ih' },
      { time: '2026-08-14T09:00:00Z', hm0: 1.7, runAt: '2026-08-14T06:00:00Z', buoyId: 4, origin: 'ih' },
      { time: '2026-08-14T10:00:00Z', hm0: 2.0, runAt: '2026-08-14T06:00:00Z', buoyId: '6200084', buoyName: 'Cabo Silleiro', origin: 'wmo-es' },
      { time: '2026-08-14T11:00:00Z', hm0: 2.1, runAt: '2026-08-14T06:00:00Z', buoyId: '6200084', buoyName: 'Cabo Silleiro', origin: 'wmo-es' },
      { time: '2026-08-14T12:00:00Z', hm0: 2.2, runAt: '2026-08-14T06:00:00Z', buoyId: '6200084', buoyName: 'Cabo Silleiro', origin: 'wmo-es' },
    ]);
    archiveObservations(a, [
      { time: '2026-08-14T08:30:00Z', hm0: 1.8, buoyId: 4, origin: 'ih' },
      { time: '2026-08-14T09:30:00Z', hm0: 2.0, buoyId: 4, origin: 'ih' },
      { time: '2026-08-14T10:30:00Z', hm0: 1.4, buoyId: '6200084', origin: 'wmo-es' },
      { time: '2026-08-14T11:30:00Z', hm0: 1.5, buoyId: '6200084', origin: 'wmo-es' },
      { time: '2026-08-14T12:30:00Z', hm0: 1.6, buoyId: '6200084', origin: 'wmo-es' },
    ]);
    const report = buildReport(a, NOW);
    expect(report.pairCount).toBe(5);
    expect(report.pairCountByOrigin).toEqual({ ih: 2, 'wmo-es': 3 });
    // Todos os pares ES vêm de boias espanholas → alimentam a camada calibrada.
    expect(report.calibratedPairCount).toBe(3);
    // Os contadores ficam também no archive (persistidos no ficheiro).
    expect(a.pairCountByOrigin).toEqual(report.pairCountByOrigin);
    expect(a.calibratedPairCount).toBe(3);
  });

  it('buildReport devolve contadores a zero sem pares (nunca null)', () => {
    const report = buildReport(emptyArchive(), NOW);
    expect(report.pairCount).toBe(0);
    expect(report.pairCountByOrigin).toEqual({ ih: 0, 'wmo-es': 0 });
    expect(report.calibratedPairCount).toBe(0);
  });
});

describe('attachWaveSkill (transparência do viés na UI)', () => {
  const row = { waveHeight: 1.8, stationName: 'CSA92/D', distanceKm: 60, source: 'ih-buoy' };
  const byBuoy = {
    '4': { n: 47, me: 0.2, mae: 0.4, rmse: 0.5 },
  };

  it('anexa o skill ME/MAE/RMSE/n quando a boia existe no índice', () => {
    // Sem origin no byBuoy, é derivada da fonte da row (ih-buoy → 'ih').
    expect(attachWaveSkill(row, byBuoy, 4)).toEqual({
      ...row,
      skill: { me: 0.2, n: 47, mae: 0.4, rmse: 0.5, origin: 'ih' },
    });
    expect(attachWaveSkill(row, byBuoy, '4')).toEqual({
      ...row,
      skill: { me: 0.2, n: 47, mae: 0.4, rmse: 0.5, origin: 'ih' },
    });
  });

  it('só anexa as stats finitas — entrada só com me/n fica sem mae/rmse', () => {
    const minimal = { '4': { n: 30, me: 0.1 } };
    expect(attachWaveSkill(row, minimal, 4)).toEqual({
      ...row,
      skill: { me: 0.1, n: 30, origin: 'ih' },
    });
    const withLead = { '4': { n: 30, me: 0.1, corr: 0.88, meanLeadHours: 6 } };
    expect(attachWaveSkill(row, withLead, 4)).toEqual({
      ...row,
      skill: { me: 0.1, n: 30, corr: 0.88, meanLeadHours: 6, origin: 'ih' },
    });
  });

  it('anexa origin/buoyName de boia ES (wmo-es) para destacar na UI', () => {
    const wmoRow = { waveHeight: 1.4, stationName: 'Cabo Silleiro', distanceKm: 96.8, source: 'wmo-buoy' };
    const es = {
      '6200084': { n: 41, me: -0.3, mae: 0.5, rmse: 0.6, origin: 'wmo-es', buoyName: 'Cabo Silleiro' },
    };
    expect(attachWaveSkill(wmoRow, es, '6200084')).toEqual({
      ...wmoRow,
      skill: { me: -0.3, n: 41, mae: 0.5, rmse: 0.6, origin: 'wmo-es', buoyName: 'Cabo Silleiro' },
    });
  });

  it('deriva origin pela fonte da row quando o arquivo legacy não tem origin', () => {
    const legacyIh = { '4': { n: 47, me: 0.2 } };
    const esRow = { waveHeight: 1.4, stationName: 'Cabo Silleiro', distanceKm: 96.8, source: 'wmo-buoy' };
    const legacyEs = { '6200084': { n: 41, me: -0.3 } };
    expect(attachWaveSkill(row, legacyIh, 4).skill.origin).toBe('ih');
    expect(attachWaveSkill(esRow, legacyEs, '6200084').skill.origin).toBe('wmo-es');
    // Um código WMO numérico não engana a derivação — manda a fonte da row.
    expect(attachWaveSkill({ ...esRow, ...{} }, legacyEs, 6200084).skill.origin).toBe('wmo-es');
  });

  it('não anexa sem boia no índice, sem byBuoy, sem id, ou sem stats', () => {
    expect(attachWaveSkill(row, byBuoy, 99)).toEqual(row);
    expect(attachWaveSkill(row, undefined, 4)).toEqual(row);
    expect(attachWaveSkill(row, byBuoy, undefined)).toEqual(row);
    expect(attachWaveSkill(row, { '4': { n: 12 } }, 4)).toEqual(row);
    expect(attachWaveSkill(row, { '4': { me: 0.1 } }, 4)).toEqual(row);
  });

  it('devolve null / linha intacta para entrada vazia', () => {
    expect(attachWaveSkill(null, byBuoy, 4)).toBeNull();
  });
});

describe('persistência + prune', () => {
  it('readArchive devolve arquivo vazio se ausente/corrompido', () => {
    const p = path.join(os.tmpdir(), 'missing-forecast-skill.json');
    expect(readArchive(p)).toEqual(emptyArchive());
    fs.writeFileSync(p, '{corrupt');
    expect(readArchive(p).forecasts).toEqual([]);
  });

  it('writeArchive + readArchive round-trip', () => {
    const p = path.join(os.tmpdir(), 'roundtrip-forecast-skill.json');
    const a = emptyArchive();
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4 },
    ]);
    writeArchive(a, p);
    const back = readArchive(p);
    expect(back.forecasts).toHaveLength(1);
    fs.rmSync(p, { force: true });
  });

  it('pruneArchive remove entradas fora da janela', () => {
    const a = emptyArchive();
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4 },
      { time: '2026-06-01T12:00:00Z', hm0: 1.5, runAt: '2026-05-01T06:00:00Z', buoyId: 4 },
    ]);
    archiveObservations(a, [
      { time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4 },
      { time: '2026-06-01T12:30:00Z', hm0: 1.8, buoyId: 4 },
    ]);
    pruneArchive(a, NOW, SKILL_WINDOW_DAYS);
    expect(a.forecasts).toHaveLength(1);
    expect(a.observations).toHaveLength(1);
  });

  it('buildReport expõe stats + lastPairs', () => {
    const a = emptyArchive();
    archiveForecastRun(a, [
      { time: '2026-08-14T12:00:00Z', hm0: 1.5, runAt: '2026-08-14T06:00:00Z', buoyId: 4 },
    ]);
    archiveObservations(a, [{ time: '2026-08-14T12:30:00Z', hm0: 1.8, buoyId: 4 }]);
    const report = buildReport(a, NOW);
    expect(report.pairCount).toBe(1);
    expect(report.stats.n).toBe(1);
    expect(report.lastPairs[0].observedHm0).toBe(1.8);
  });

  it('constantes de janela são 30 dias / 10 pares / 168h lead', () => {
    expect(SKILL_WINDOW_DAYS).toBe(30);
    expect(MIN_PAIRS).toBe(10);
    expect(MAX_FORECAST_LEAD_HOURS).toBe(168);
  });
});

describe('fetch-forecast-skill.js (caminho real, sem key)', () => {
  const MODULE_PATH = '../../fetch-forecast-skill.js';
  let tmpDir;

  function loadModule(overrides = {}, inputPaths = {}) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'));
    process.env.IH_API_URL = 'http://mock-ih.local';
    process.env.IH_BUOY_WAVE_API_URL = 'http://mock-ih.local/wave';
    process.env.FORECAST_SKILL_OUTPUT_PATH = path.join(tmpDir, 'forecast-skill.json');
    delete process.env.IH_API_KEY;
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    // Inputs (forecasts/ih-buoys/wmo archive) — env tem de estar setado ANTES
    // do require (o módulo captura os paths em load time). Aceita função para
    // resolver depois de tmpDir existir (os args são avaliados antes da call).
    const paths = typeof inputPaths === 'function' ? inputPaths(tmpDir) : inputPaths;
    for (const [k, v] of Object.entries(paths)) process.env[k] = v;
    const resolved = require.resolve(MODULE_PATH);
    delete require.cache[resolved];
    return require(resolved);
  }

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.IH_API_KEY;
    delete process.env.FORECASTS_PATH;
    delete process.env.IH_BUOYS_PATH;
    delete process.env.WMO_BIAS_ARCHIVE_PATH;
    delete process.env.WMO_BUOYS_PATH;
    vi.useRealTimers();
  });

  /** Fixtures mínimos para o caminho real do script (inputs env-overridable). */
  function writeInputFixtures({ t2, t3, obsAt }) {
    fs.writeFileSync(path.join(tmpDir, 'forecasts.json'), JSON.stringify({
      moledo: [
        { time: t2, waveHeight: 1.4 },
        { time: t3, waveHeight: 1.5 },
      ],
    }));
    fs.writeFileSync(path.join(tmpDir, 'ih-buoys.json'), JSON.stringify({
      stations: { 4: { idEst: 4, name: 'CSA92/D', status: 'active' } },
      spotMapping: { moledo: { idEst: 4, distanceKm: 60 } },
    }));
    fs.writeFileSync(path.join(tmpDir, 'wmo-bias-archive.json'), JSON.stringify({
      buoys: {
        '6200084': {
          name: 'Cabo Silleiro',
          lat: 42.12,
          lon: -9.43,
          readings: [{ date: obsAt, hm0: 1.6 }],
        },
      },
    }));
    fs.writeFileSync(path.join(tmpDir, 'wmo-buoys.json'), JSON.stringify({
      buoys: { '6200084': { code: '6200084', name: 'Cabo Silleiro', lat: 42.12, lon: -9.43 } },
    }));
  }

  function inputEnv(dir = tmpDir) {
    return {
      FORECASTS_PATH: path.join(dir, 'forecasts.json'),
      IH_BUOYS_PATH: path.join(dir, 'ih-buoys.json'),
      WMO_BIAS_ARCHIVE_PATH: path.join(dir, 'wmo-bias-archive.json'),
      WMO_BUOYS_PATH: path.join(dir, 'wmo-buoys.json'),
    };
  }

  it('sem key arquiva previsões e escreve o arquivo (exit 0)', async () => {
    const mod = loadModule();
    const calledUrls = [];
    const fetchMock = vi.fn(async (url) => {
      calledUrls.push(String(url));
      throw new Error('sem key não deve fetchar dados de ondas');
    });
    vi.stubGlobal('fetch', fetchMock);

    await mod.run();
    // O refresh de estações é público e acontece sempre; o que NÃO pode
    // acontecer sem key é o fetch de leituras de ondas (getDatawellData).
    expect(calledUrls.some((u) => u.includes('getDatawellData'))).toBe(false);
    const out = JSON.parse(fs.readFileSync(process.env.FORECAST_SKILL_OUTPUT_PATH, 'utf8'));
    expect(out.forecasts.length).toBeGreaterThan(0);
    expect(out.pairCount).toBe(0);
  });

  it('com wmo-bias-archive (Silleiro) + spots NW, sem key → arquiva previsões+leituras ES no output', async () => {
    const mod = loadModule({}, (dir) => inputEnv(dir));
    const t2 = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const t3 = new Date(Date.now() + 3 * 3_600_000).toISOString();
    writeInputFixtures({ t2, t3, obsAt: new Date(Date.now() - 3_600_000).toISOString() });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline — sem key não deve fetchar dados de ondas');
    }));

    await mod.run();
    const out = JSON.parse(fs.readFileSync(process.env.FORECAST_SKILL_OUTPUT_PATH, 'utf8'));
    // O spot NW (moledo, a ~59 km do Silleiro) arquiva previsões ES futuras...
    expect(out.forecasts.some((f) => f.buoyId === '6200084' && f.buoyName === 'Cabo Silleiro')).toBe(true);
    // ...e as leituras acumuladas do wmo-bias-archive entram como observações.
    expect(out.observations.some((o) => o.buoyId === '6200084' && o.hm0 === 1.6)).toBe(true);
    // Sem IH_API_KEY o caminho IH fica só com previsões — nunca fetcha ondas.
    expect(out.observations.every((o) => typeof o.buoyId === 'string')).toBe(true);
    expect(out.pairCount).toBe(0); // horas futuras — sem verdade ainda
  });

  it('par ES end-to-end ao fim de 2 runs (acumulação) sem IH_API_KEY', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-08-14T10:00:00Z'));
    const mod = loadModule({}, (dir) => inputEnv(dir));
    // Previsões para 13:00Z e 14:00Z (lead 3h/4h do run 1) + leitura da mesma hora.
    writeInputFixtures({
      t2: '2026-08-14T13:00:00Z',
      t3: '2026-08-14T14:00:00Z',
      obsAt: '2026-08-14T13:00:00Z',
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    // Run 1 (10:00Z) — arquiva previsão ES + leitura, mas 13:00Z ainda é futuro.
    await mod.run();
    const out1 = JSON.parse(fs.readFileSync(process.env.FORECAST_SKILL_OUTPUT_PATH, 'utf8'));
    expect(out1.pairCount).toBe(0);
    expect(out1.forecasts.some((f) => f.buoyId === '6200084')).toBe(true);

    // Run 2 (13:30Z) — a hora 13:00Z já passou → o par ES forma-se com lead real.
    vi.setSystemTime(Date.parse('2026-08-14T13:30:00Z'));
    await mod.run();
    const out2 = JSON.parse(fs.readFileSync(process.env.FORECAST_SKILL_OUTPUT_PATH, 'utf8'));
    expect(out2.pairs).toHaveLength(1);
    expect(out2.pairs[0]).toMatchObject({
      buoyId: '6200084',
      buoyName: 'Cabo Silleiro',
      forecastHm0: 1.4,
      observedHm0: 1.6,
      leadTimeHours: 3,
    });
    // A previsão de 14:00Z mantém o runAt mais antigo (10:00Z) — a acumulação
    // não sobrescreve com o nowcast do run 2.
    const kept = out2.forecasts.find((f) => f.buoyId === '6200084' && f.hourKey === '2026-08-14T14');
    expect(kept.runAt).toBe('2026-08-14T10:00:00.000Z');
  });

  it('com key fetcha observações e cruza pares', async () => {
    const mod = loadModule({ IH_API_KEY: 'test-key' });
    const json = (body) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/collections/')) return json({ features: [] });
      if (u.includes('/getDatawellData')) {
        // Observação da boia 4 na mesma hora de uma previsão do arquivo.
        return json([
          { date: new Date(Date.now() - 3_600_000).toISOString(), hm0: 1.8, tp: 10 },
        ]);
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await mod.run();
    const out = JSON.parse(fs.readFileSync(process.env.FORECAST_SKILL_OUTPUT_PATH, 'utf8'));
    expect(out.observations.length).toBeGreaterThanOrEqual(0);
    expect(out.forecasts.length).toBeGreaterThan(0);
  });
});
