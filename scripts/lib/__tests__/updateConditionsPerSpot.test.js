import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { processSpot } = require('../updateConditionsPerSpot.js');

describe('updateConditionsPerSpot', () => {
  it('fetches both sources, inherits confidence, and returns normalized outputs', async () => {
    const marine = { hourly: { time: ['2026-01-01T00:00'], wave_height: [1], wave_period: [10], wave_direction: [90], swell_wave_height: [0], swell_wave_period: [0], swell_wave_direction: [0], wind_wave_height: [0], sea_surface_temperature: [17], sea_level_height_msl: [0] } };
    const weather = { hourly: { time: ['2026-01-01T00:00'], wind_speed_10m: [4], wind_direction_10m: [180], wind_gusts_10m: [6] } };
    const fetchers = { fetchMarineData: vi.fn(async () => marine), fetchWeatherData: vi.fn(async () => weather), fetchMarineWaveModels: vi.fn(), fetchWindModels: vi.fn() };
    const getCurrentConditions = vi.fn(() => ({ waveHeight: 1, windSpeed: 4 }));
    const result = await processSpot({ id: 'x', lat: 1, lon: 2 }, { useMultiModel: false, previousConditions: {}, ihTides: { stations: {}, spotMapping: {} }, waveBias: null, waveBiasEnabled: false, usage: {}, fetchers, findCurrentHourIndex: () => 0, confidenceAtIndex: vi.fn(), confidenceByDay: vi.fn(), blendWindAtIndex: vi.fn(), readModelMap: vi.fn(), applyWindBlendToHours: vi.fn(), waveModels: [], windModels: [], isFreshIhObservation: vi.fn(), getCurrentConditions, log: { log: vi.fn() } });
    expect(fetchers.fetchMarineData).toHaveBeenCalledWith(1, 2, {});
    expect(fetchers.fetchWeatherData).toHaveBeenCalledWith(1, 2, {});
    expect(result.conditions).toEqual(expect.objectContaining({ waveHeight: 1, confidence: 'média' }));
    expect(result.forecast).toHaveLength(1);
  });
});
