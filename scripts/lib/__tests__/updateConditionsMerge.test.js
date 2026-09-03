import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildConditionsRow, mergeForecast, readOceanCurrent } = require('../updateConditionsMerge.js');

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

  it('reads SMOC currents in m/s and treats missing arrays as slack', () => {
    expect(readOceanCurrent({ ocean_current_velocity: [0.18], ocean_current_direction: [214] }, 0)).toEqual({
      currentSpeed: 0.18,
      currentDir: 214,
    });
    expect(readOceanCurrent({ ocean_current_velocity: [0.27], ocean_current_direction: [-10] }, 0).currentDir).toBe(350);
    expect(readOceanCurrent({}, 0)).toEqual({ currentSpeed: 0, currentDir: 0 });
  });

  it('merges ocean current onto forecast hours when the marine series has them', () => {
    const marine = { hourly: { time: ['a'], wave_height: [1], wave_period: [10], wave_direction: [90], swell_wave_height: [0.5], swell_wave_period: [12], swell_wave_direction: [80], wind_wave_height: [0.2], sea_surface_temperature: [17], sea_level_height_msl: [0.1], ocean_current_velocity: [0.22], ocean_current_direction: [180] } };
    const weather = { hourly: { time: ['a'], wind_speed_10m: [3], wind_direction_10m: [180], wind_gusts_10m: [6] } };
    expect(mergeForecast(marine, weather)[0]).toEqual(expect.objectContaining({ currentSpeed: 0.22, currentDir: 180 }));
  });

  it('merges air temperature when the weather series has temperature_2m', () => {
    const marine = { hourly: { time: ['a'], wave_height: [1], wave_period: [10], wave_direction: [90], swell_wave_height: [0.5], swell_wave_period: [12], swell_wave_direction: [80], wind_wave_height: [0.2], sea_surface_temperature: [17], sea_level_height_msl: [0.1] } };
    const weather = { hourly: { time: ['a'], wind_speed_10m: [3], wind_direction_10m: [180], wind_gusts_10m: [6], temperature_2m: [24.16] } };
    expect(mergeForecast(marine, weather)[0]).toEqual(expect.objectContaining({ airTemp: 24.2, waterTemp: 17 }));
    const noAir = { hourly: { time: ['a'], wind_speed_10m: [3], wind_direction_10m: [180], wind_gusts_10m: [6] } };
    expect(mergeForecast(marine, noAir)[0].airTemp).toBeUndefined();
  });
});
