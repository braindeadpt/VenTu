import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  buildMarineParams,
  buildWeatherParams,
  buildMarineModelsParams,
  buildWindModelsParams,
  createUpdateConditionsFetcher,
} = require('../updateConditionsFetch.js');
const { WAVE_MODELS, WIND_MODELS } = require('../forecastConfidence.js');

describe('updateConditionsFetch', () => {
  it('preserves the source query contracts', () => {
    expect(buildMarineParams(41.2, -8.7).get('hourly')).toContain('wave_height');
    expect(buildMarineParams(41.2, -8.7).get('hourly')).toContain('ocean_current_velocity');
    expect(buildMarineParams(41.2, -8.7).get('hourly')).toContain('ocean_current_direction');
    expect(buildMarineParams(41.2, -8.7).get('wind_speed_unit')).toBe('ms');
    expect(buildMarineParams(41.2, -8.7).get('timezone')).toBe('Europe/Lisbon');
    expect(buildWeatherParams(41.2, -8.7).get('wind_speed_unit')).toBe('ms');
    expect(buildMarineModelsParams(41.2, -8.7).get('models')).toBe(WAVE_MODELS.join(','));
    expect(buildWindModelsParams(41.2, -8.7).get('models')).toBe(WIND_MODELS.join(','));
  });

  it('delegates the four source requests with the original retry and weights', async () => {
    const fetchWithRetry = vi.fn(async (url, retries, delay, usage, weight) => ({ url, retries, delay, usage, weight }));
    const usage = { record: vi.fn() };
    const fetcher = createUpdateConditionsFetcher({ marineApi: 'marine', weatherApi: 'weather', fetchWithRetry });
    await fetcher.fetchMarineData(1, 2, usage);
    await fetcher.fetchWeatherData(1, 2, usage);
    await fetcher.fetchMarineWaveModels(1, 2, usage);
    await fetcher.fetchWindModels(1, 2, usage);
    expect(fetchWithRetry).toHaveBeenCalledTimes(4);
    expect(fetchWithRetry.mock.calls.map((call) => call[4])).toEqual([1, 1, WAVE_MODELS.length, WIND_MODELS.length]);
    expect(fetchWithRetry.mock.calls.every((call) => call[1] === 3 && call[2] === 1000)).toBe(true);
  });
});
