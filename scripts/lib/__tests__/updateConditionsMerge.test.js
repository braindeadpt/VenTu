import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildConditionsRow, mergeForecast } = require('../updateConditionsMerge.js');

describe('updateConditionsMerge', () => {
  it('builds the public conditions row without leaking internal wind fields', () => {
    const row = buildConditionsRow({}, { _windBlend: { method: 'median', blended: true, modelCount: 3 } }, {}, { waveHeight: 2 }, { confidence: 'alta', waveSpread: 1, windSpread: 2, waveSpreadPct: 3, windSpreadPct: 4, combinedSpreadPct: 5, degraded: false }, [], true);
    expect(row.waveHeight).toBe(2);
    expect(row.windBlend).toEqual({ method: 'median', blended: true, modelCount: 3 });
    expect(row.updatedAt).toEqual(expect.any(String));
  });

  it('merges aligned marine and weather series and caps output at 168 hours', () => {
    const marine = { hourly: { time: ['a', 'b'], wave_height: [1, 2], wave_period: [10, 11], wave_direction: [90, 100], swell_wave_height: [0.5, 0], swell_wave_period: [12, 0], swell_wave_direction: [80, 0], wind_wave_height: [0.2, 0.3], sea_surface_temperature: [17, 18], sea_level_height_msl: [0.1, 0.2] } };
    const weather = { hourly: { time: ['a', 'b', 'c'], wind_speed_10m: [3, 4, 5], wind_direction_10m: [180, 190, 200], wind_gusts_10m: [6, 7, 8] } };
    expect(mergeForecast(marine, weather)).toEqual([
      expect.objectContaining({ time: 'a', waveHeight: 1, windSpeed: 3, wavePowerKw: expect.any(Number) }),
      expect.objectContaining({ time: 'b', waveHeight: 2, windSpeed: 4 }),
    ]);
  });
});
