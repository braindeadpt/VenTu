import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { selectObservedWave } = require('../observedWaveMerge.js');

const NOW = Date.UTC(2026, 7, 14, 18, 0, 0); // 2026-08-14T18:00Z

const ihWave = {
  waveHeight: 1.8,
  wavePeriod: 11,
  stationName: 'CSA92/D',
  distanceKm: 60,
  observedAt: '2026-08-14T17:00:00Z', // 1h
  source: 'ih-buoy',
};
const wmoWave = {
  waveHeight: 1.6,
  wavePeriod: 10,
  stationName: 'Cabo Silleiro',
  distanceKm: 56,
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
      ihDistanceKm: 60,
      wmoDistanceKm: 56,
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
});
