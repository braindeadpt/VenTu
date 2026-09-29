import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mergeForecast } = require('../updateConditionsMerge.js');
const { uvIndexFields } = require('../updateConditionsPure.js');

const marine = {
  hourly: {
    time: ['2026-01-15T00:00', '2026-01-15T01:00'],
    wave_height: [1, 2],
    wave_period: [10, 11],
    wave_direction: [90, 100],
    swell_wave_height: [0.5, 0],
    swell_wave_period: [12, 0],
    swell_wave_direction: [80, 0],
    wind_wave_height: [0.2, 0.3],
    sea_surface_temperature: [17, 18],
    sea_level_height_msl: [0.1, 0.2],
  },
};

describe('uv_index pipeline (Phase A)', () => {
  it('merges uvIndex onto forecast rows when the weather series has it', () => {
    const weather = {
      hourly: {
        time: ['2026-01-15T00:00', '2026-01-15T01:00'],
        wind_speed_10m: [3, 4],
        wind_direction_10m: [180, 190],
        wind_gusts_10m: [6, 7],
        uv_index: [0, 5.24],
      },
    };
    const rows = mergeForecast(marine, weather);
    expect(rows[0].uvIndex).toBe(0);
    expect(rows[1].uvIndex).toBe(5.2);
  });

  it('omits uvIndex on rows without a finite value', () => {
    const weather = {
      hourly: {
        time: ['2026-01-15T00:00'],
        wind_speed_10m: [3],
        wind_direction_10m: [180],
        wind_gusts_10m: [6],
        uv_index: [null],
      },
    };
    expect(mergeForecast(marine, weather)[0].uvIndex).toBeUndefined();
    const noUv = { ...weather, hourly: { ...weather.hourly, uv_index: undefined } };
    expect(mergeForecast(marine, noUv)[0].uvIndex).toBeUndefined();
  });

  it('uvIndexFields returns current value + daily max for the local day', () => {
    const hourly = {
      time: [
        '2026-01-15T22:00', '2026-01-15T23:00',
        '2026-01-16T00:00', '2026-01-16T06:00', '2026-01-16T13:00', '2026-01-16T20:00',
        '2026-01-17T00:00',
      ],
      uv_index: [0, 0, 0, 1.5, 7.83, 2.2, 9.9],
    };
    // timeIndex 2 → 2026-01-16: max among that day's rows = 7.8 (the 9.9 is the next day)
    expect(uvIndexFields(hourly, 2)).toEqual({ uvIndex: 0, uvIndexMax: 7.8 });
    expect(uvIndexFields(hourly, 4)).toEqual({ uvIndex: 7.8, uvIndexMax: 7.8 });
  });

  it('uvIndexFields degrades to {} without a series and omits non-finite parts', () => {
    expect(uvIndexFields({}, 0)).toEqual({});
    expect(uvIndexFields({ time: ['2026-01-15T00:00'] }, 0)).toEqual({});
    const partial = { time: ['2026-01-15T00:00'], uv_index: [null] };
    expect(uvIndexFields(partial, 0)).toEqual({});
  });
});
