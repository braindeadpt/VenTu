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
    // auditoria M1: pedidos em UTC com a janela dos 7 dias locais (antes: timezone=Europe/Lisbon, offset único)
    for (const build of [buildMarineParams, buildWeatherParams, buildMarineModelsParams, buildWindModelsParams]) {
      const q = build(41.2, -8.7, { nowMs: Date.parse('2026-10-19T08:00:00Z') });
      expect(q.get('timezone')).toBe('GMT');
      expect(q.get('timeformat')).toBe('unixtime');
      // 19/10 00:00 WEST → 25/10 23:00 WET: 169 horas reais (o 01:00 de 25/10 repete-se)
      expect(q.get('start_hour')).toBe('2026-10-18T23:00');
      expect(q.get('end_hour')).toBe('2026-10-25T23:00');
      expect(q.has('forecast_days')).toBe(false);
    }
    // Açores: janela nos dias locais dos Açores
    const az = buildMarineParams(38.633, -27.967, { nowMs: Date.parse('2026-10-16T12:00:00Z') });
    expect(az.get('start_hour')).toBe('2026-10-16T00:00');
    expect(az.get('end_hour')).toBe('2026-10-22T23:00');
    expect(buildWeatherParams(41.2, -8.7).get('wind_speed_unit')).toBe('ms');
    expect(buildWeatherParams(41.2, -8.7).get('hourly')).toContain('temperature_2m');
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

  it('converte as respostas unixtime para a hora de parede do spot, com desvio', async () => {
    const fetchWithRetry = vi.fn(async () => ({ hourly: { time: [1792886400, 1792890000] } }));
    const fetcher = createUpdateConditionsFetcher({ marineApi: 'marine', weatherApi: 'weather', fetchWithRetry });
    const lx = await fetcher.fetchMarineData(38.73, -9.47);
    expect(lx.hourly.time).toEqual(['2026-10-25T01:00+01:00', '2026-10-25T01:00+00:00']);
    const az = await fetcher.fetchWeatherData(37.74, -25.67);
    expect(az.hourly.time).toEqual(['2026-10-25T00:00+00:00', '2026-10-25T00:00-01:00']);
  });
});
