import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { selectObservedWave, OBSERVED_WAVE_MAX_KM } = require('../observedWaveMerge.js');
import { OBSERVED_WAVE_MAX_DISTANCE_KM } from '../../../src/lib/observedWave';

const NOW = Date.UTC(2026, 7, 14, 18, 0, 0); // 2026-08-14T18:00Z

const ihWave = {
  waveHeight: 1.8,
  wavePeriod: 11,
  stationName: 'CSA92/D',
  distanceKm: 30,
  observedAt: '2026-08-14T17:00:00Z', // 1h
  source: 'ih-buoy',
};
const wmoWave = {
  waveHeight: 1.6,
  wavePeriod: 10,
  stationName: 'Cabo Silleiro',
  distanceKm: 26,
  observedAt: '2026-08-14T16:00:00Z', // 2h
  source: 'wmo-buoy',
};

describe('selectObservedWave', () => {
  it('ambas as fontes → vencedor IH (primária), alternativo WMO, razão ih-fresh com idades/distâncias', () => {
    const { wave, alt, meta } = selectObservedWave(ihWave, wmoWave, { nowMs: NOW });
    expect(wave.source).toBe('ih-buoy');
    expect(alt.source).toBe('wmo-buoy');
    expect(alt.stationName).toBe('Cabo Silleiro');
    expect(meta).toEqual({
      winner: 'ih',
      reason: 'ih-fresh',
      ihAgeHours: 1,
      wmoAgeHours: 2,
      ihDistanceKm: 30,
      wmoDistanceKm: 26,
    });
  });

  it('só IH → vencedor IH sem alternativo, razão ih-only', () => {
    const { wave, alt, meta } = selectObservedWave(ihWave, null, { nowMs: NOW });
    expect(wave.source).toBe('ih-buoy');
    expect(alt).toBeNull();
    expect(meta.reason).toBe('ih-only');
    expect(meta.wmoAgeHours).toBeNull();
    expect(meta.wmoDistanceKm).toBeNull();
  });

  it('só WMO → vencedor WMO (fallback), razão wmo-only', () => {
    const { wave, alt, meta } = selectObservedWave(null, wmoWave, { nowMs: NOW });
    expect(wave.source).toBe('wmo-buoy');
    expect(alt).toBeNull();
    expect(meta.reason).toBe('wmo-only');
    expect(meta.ihAgeHours).toBeNull();
  });

  it('nenhuma fonte → tudo null', () => {
    expect(selectObservedWave(null, null, { nowMs: NOW })).toEqual({
      wave: null,
      alt: null,
      meta: null,
    });
  });

  it('redondeia a idade a 1 casa decimal', () => {
    const { meta } = selectObservedWave(
      { ...ihWave, observedAt: '2026-08-14T17:05:00Z' },
      null,
      { nowMs: NOW },
    );
    expect(meta.ihAgeHours).toBe(0.9); // 55 min
  });

  it('paridade do limite de distância com src/lib/observedWave.ts', () => {
    expect(OBSERVED_WAVE_MAX_KM).toBe(40);
    expect(OBSERVED_WAVE_MAX_KM).toBe(OBSERVED_WAVE_MAX_DISTANCE_KM);
  });

  it('boia a mais de 40 km não é a onda do spot: nem vencedora nem alternativa (A5)', () => {
    const sines = { ...ihWave, stationName: 'CSA83/1D', distanceKm: 188.1 };
    // IH longe + WMO perto → ganha a WMO, sem alternativa.
    const r = selectObservedWave(sines, wmoWave, { nowMs: NOW });
    expect(r.wave.stationName).toBe('Cabo Silleiro');
    expect(r.alt).toBeNull();
    expect(r.meta.reason).toBe('wmo-only');
    expect(r.meta.ihDistanceKm).toBeNull();
    // Só IH longe → nada.
    expect(selectObservedWave(sines, null, { nowMs: NOW })).toEqual({ wave: null, alt: null, meta: null });
    // Limite inclusivo.
    expect(selectObservedWave({ ...ihWave, distanceKm: 40 }, null, { nowMs: NOW }).wave).not.toBeNull();
    expect(selectObservedWave({ ...ihWave, distanceKm: 40.1 }, null, { nowMs: NOW }).wave).toBeNull();
  });

  it('a ponte declarada (Cabo Silleiro → Nazaré, bridge: true) fica no cartão apesar da distância', () => {
    const ponte = { ...wmoWave, distanceKm: 281.4, bridge: true, stationCode: '6200084' };
    const { wave, alt, meta } = selectObservedWave(null, ponte, { nowMs: NOW });
    expect(wave).toMatchObject({ stationName: 'Cabo Silleiro', bridge: true, distanceKm: 281.4 });
    expect(alt).toBeNull();
    expect(meta).toMatchObject({ winner: 'wmo', reason: 'wmo-only', wmoDistanceKm: 281.4 });
    // Sem `bridge`, a mesma leitura longe sai.
    expect(selectObservedWave(null, { ...wmoWave, distanceKm: 281.4 }, { nowMs: NOW }).wave).toBeNull();
  });
});
