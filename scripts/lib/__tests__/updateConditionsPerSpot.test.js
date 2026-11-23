import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { processSpot } = require('../updateConditionsPerSpot.js');
const { blendWindAtIndex, readModelMap, applyWindBlendToHours } = require('../windBlend.js');

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

  it('samples ensemble model health from multimodel payloads', async () => {
    const marine = { hourly: { time: ['2026-01-01T00:00'], wave_height: [1], wave_period: [10], wave_direction: [90], swell_wave_height: [0], swell_wave_period: [0], swell_wave_direction: [0], wind_wave_height: [0], sea_surface_temperature: [17], sea_level_height_msl: [0] } };
    const weather = { hourly: { time: ['2026-01-01T00:00'], wind_speed_10m: [4], wind_direction_10m: [180], wind_gusts_10m: [6] } };
    const marineWaveModels = { hourly: { time: ['2026-01-01T00:00'], wave_height_ewam: [1.2] } };
    const windModelData = { hourly: { time: ['2026-01-01T00:00'], wind_speed_10m_icon_eu: [5] } };
    const fetchers = {
      fetchMarineData: vi.fn(async () => marine),
      fetchWeatherData: vi.fn(async () => weather),
      fetchMarineWaveModels: vi.fn(async () => marineWaveModels),
      fetchWindModels: vi.fn(async () => windModelData),
    };
    const modelHealthRun = { waveCounts: {}, windCounts: {}, sampledSpots: 0 };
    const mergeCounts = vi.fn((acc, counts) => Object.assign(acc, counts));
    const countModelSlots = vi.fn((hourly, baseKey) => ({ [baseKey]: { ok: 1, total: 1, absentCount: 0 } }));
    const HEALTH_FAMILIES = { wave: { baseKey: 'wave_height', models: ['ewam'] }, wind: { baseKey: 'wind_speed_10m', models: ['icon_eu'] } };
    await processSpot({ id: 'x', lat: 1, lon: 2, region: 'Lisboa' }, {
      useMultiModel: true,
      previousConditions: {},
      ihTides: { stations: {}, spotMapping: {} },
      waveBias: null,
      waveBiasEnabled: false,
      usage: {},
      fetchers,
      findCurrentHourIndex: () => 0,
      confidenceAtIndex: vi.fn(() => ({ confidence: 'alta' })),
      confidenceByDay: vi.fn(() => ({})),
      blendWindAtIndex: vi.fn(() => ({ windSpeed: 4, windDirection: 180, windGust: 6 })),
      readModelMap: vi.fn(() => ({})),
      applyWindBlendToHours: vi.fn(),
      waveModels: ['ewam'],
      windModels: ['icon_eu'],
      isFreshIhObservation: vi.fn(),
      getCurrentConditions: vi.fn(() => ({ waveHeight: 1, windSpeed: 4 })),
      log: { log: vi.fn() },
      modelHealthRun,
      modelHealth: { mergeCounts, countModelSlots, HEALTH_FAMILIES },
    });
    expect(countModelSlots).toHaveBeenCalledTimes(2);
    expect(modelHealthRun.sampledSpots).toBe(1);
    expect(modelHealthRun.waveCounts).toEqual(expect.objectContaining({ wave_height: expect.any(Object) }));
  });

  it('grava a banda P10/P50/P90 nas linhas horárias a partir dos membros já descarregados', async () => {
    const times = ['2026-01-01T00:00', '2026-01-01T01:00'];
    const marine = { hourly: { time: times, wave_height: [1.4, 1.4], wave_period: [10, 10], wave_direction: [90, 90], swell_wave_height: [1, 1], swell_wave_period: [10, 10], swell_wave_direction: [90, 90], wind_wave_height: [0.2, 0.2], sea_surface_temperature: [17, 17], sea_level_height_msl: [0, 0] } };
    const weather = { hourly: { time: times, wind_speed_10m: [4, 4], wind_direction_10m: [180, 180], wind_gusts_10m: [6, 6] } };
    // 3 membros por família (o mínimo para publicar uma banda).
    const marineWaveModels = { hourly: { time: times, wave_height_ewam: [1.2, 1.2], wave_height_ecmwf_wam: [1.4, 1.4], wave_height_gwam: [1.6, 1.6] } };
    const windModelData = { hourly: { time: times, wind_speed_10m_icon_eu: [5, 5], wind_speed_10m_ecmwf_ifs025: [6, 6], wind_speed_10m_gfs_seamless: [8, 8] } };
    const fetchers = {
      fetchMarineData: vi.fn(async () => marine),
      fetchWeatherData: vi.fn(async () => weather),
      fetchMarineWaveModels: vi.fn(async () => marineWaveModels),
      fetchWindModels: vi.fn(async () => windModelData),
    };
    const result = await processSpot({ id: 'x', lat: 1, lon: 2 }, {
      useMultiModel: true,
      previousConditions: {},
      ihTides: { stations: {}, spotMapping: {} },
      waveBias: null,
      waveBiasEnabled: false,
      usage: {},
      fetchers,
      findCurrentHourIndex: () => 0,
      confidenceAtIndex: vi.fn(() => ({ confidence: 'alta' })),
      confidenceByDay: vi.fn(() => ({})),
      blendWindAtIndex: vi.fn(() => ({ windSpeed: 4, windDirection: 180, windGust: 6 })),
      readModelMap: vi.fn(() => ({})),
      applyWindBlendToHours: vi.fn(),
      waveModels: ['ewam', 'ecmwf_wam', 'gwam'],
      windModels: ['icon_eu', 'ecmwf_ifs025', 'gfs_seamless'],
      isFreshIhObservation: vi.fn(),
      getCurrentConditions: vi.fn(() => ({ waveHeight: 1.4, windSpeed: 4 })),
      log: { log: vi.fn() },
    });

    // R-7 com 3 membros: P10 = min + 0,2·(x1-x0); P90 = x1 + 0,8·(x2-x1).
    for (const row of result.forecast) {
      expect(row.ens).toEqual([1.24, 1.4, 1.56, 5.2, 6, 7.6, 3, 3]);
    }
    expect(result.ensembleHours).toBe(2);
    // Zero pedidos extra: os membros vieram dos payloads já pedidos por spot.
    for (const f of Object.values(fetchers)) expect(f).toHaveBeenCalledTimes(1);
  });

  it('aplica a mistura de vento UMA SÓ VEZ em useMultiModel: conditions e forecast[horaAtual] são idênticos', async () => {
    const times = ['2026-07-21T11:00', '2026-07-21T12:00', '2026-07-21T13:00'];
    const currentIdx = 1;
    const marine = {
      hourly: {
        time: times,
        wave_height: [1.2, 1.4, 1.5],
        wave_period: [10, 11, 11],
        wave_direction: [290, 290, 290],
        swell_wave_height: [1.0, 1.1, 1.2],
        swell_wave_period: [10, 11, 11],
        swell_wave_direction: [290, 290, 290],
        wind_wave_height: [0.3, 0.4, 0.4],
        sea_surface_temperature: [17, 17, 17],
        sea_level_height_msl: [0, 0.2, 0.4],
      },
    };
    // Caso assimétrico na hora atual (idx=1): best_match 14 m/s @ 270° (rajada 18)
    // vs icon_eu 7 m/s @ 315° (rajada 10). Se a mistura fosse aplicada 2x (87,75 %),
    // forecast[1] divergiria fortemente de conditions.
    const weather = {
      hourly: {
        time: times,
        wind_speed_10m: [6, 14, 10],
        wind_direction_10m: [280, 270, 260],
        wind_gusts_10m: [8, 18, 13],
      },
    };
    const marineWaveModels = {
      hourly: { time: times, wave_height_ewam: [1.2, 1.4, 1.5] },
    };
    const windModelData = {
      hourly: {
        time: times,
        wind_speed_10m_icon_eu: [5, 7, 9],
        wind_direction_10m_icon_eu: [300, 315, 290],
        wind_gusts_10m_icon_eu: [7, 10, 12],
      },
    };
    const fetchers = {
      fetchMarineData: vi.fn(async () => marine),
      fetchWeatherData: vi.fn(async () => weather),
      fetchMarineWaveModels: vi.fn(async () => marineWaveModels),
      fetchWindModels: vi.fn(async () => windModelData),
    };
    const getCurrentConditions = vi.fn((_marineData, currentWeatherData) => ({
      waveHeight: _marineData.hourly.wave_height[currentIdx],
      windSpeed: currentWeatherData.hourly.wind_speed_10m[currentIdx],
      windDirection: currentWeatherData.hourly.wind_direction_10m[currentIdx],
      windGust: currentWeatherData.hourly.wind_gusts_10m[currentIdx],
    }));

    const result = await processSpot({ id: 'guincho', lat: 38.73, lon: -9.47, region: 'Lisboa' }, {
      useMultiModel: true,
      previousConditions: {},
      ihTides: { stations: {}, spotMapping: {} },
      waveBias: null,
      waveBiasEnabled: false,
      usage: {},
      fetchers,
      findCurrentHourIndex: () => currentIdx,
      confidenceAtIndex: vi.fn(() => ({ confidence: 'alta' })),
      confidenceByDay: vi.fn(() => ({})),
      blendWindAtIndex,
      readModelMap,
      applyWindBlendToHours,
      waveModels: ['ewam'],
      windModels: ['icon_eu'],
      isFreshIhObservation: vi.fn(),
      getCurrentConditions,
      log: { log: vi.fn() },
    });

    const expectedSingle = blendWindAtIndex(14, 270, 18, { icon_eu: 7 }, { icon_eu: 315 }, { icon_eu: 10 });
    const wrongDouble = blendWindAtIndex(
      expectedSingle.windSpeed,
      expectedSingle.windDirection,
      expectedSingle.windGust,
      { icon_eu: 7 },
      { icon_eu: 315 },
      { icon_eu: 10 },
    );

    const rowNow = result.forecast[currentIdx];
    expect(result.conditions.windSpeed).toBe(rowNow.windSpeed);
    expect(result.conditions.windDirection).toBe(rowNow.windDirection);
    expect(result.conditions.windGust).toBe(rowNow.windGust);

    // Confirma que é exatamente a mistura simples (65 % ICON-EU), nunca dupla (87,75 %)
    expect(rowNow.windSpeed).toBe(expectedSingle.windSpeed);
    expect(rowNow.windDirection).toBe(expectedSingle.windDirection);
    expect(rowNow.windGust).toBe(expectedSingle.windGust);
    expect(rowNow.windSpeed).not.toBe(wrongDouble.windSpeed);
    expect(rowNow.windDirection).not.toBe(wrongDouble.windDirection);
    expect(rowNow.windGust).not.toBe(wrongDouble.windGust);

    // O payload original `weather.hourly` não foi mutado in-place
    expect(weather.hourly.wind_speed_10m[currentIdx]).toBe(14);
  });
});
