const { WAVE_MODELS, WIND_MODELS } = require('./forecastConfidence');
const { spotTimeZone, utcRequestParams, localizeHourly } = require('./openMeteoUtc');

/**
 * Todos os pedidos Open-Meteo vão em UTC (`timezone=GMT&timeformat=unixtime`)
 * com a janela dos 7 dias LOCAIS do spot; `localizeHourly` converte cada hora
 * para o fuso do spot (Lisboa, Açores ou Madeira) com o desvio real dessa hora
 * (auditoria M1: mudança de hora de 25/10; B3: Açores).
 * `opts.nowMs` só existe para os testes.
 */
const FORECAST_DAYS = 7;

function timeParams(lat, lon, opts = {}) {
  const tz = opts.tz || spotTimeZone({ lat, lon });
  return utcRequestParams({ tz, nowMs: opts.nowMs ?? Date.now(), days: FORECAST_DAYS });
}

function buildMarineParams(lat, lon, opts) {
  return new URLSearchParams({
    latitude: lat.toString(), longitude: lon.toString(),
    hourly: ['wave_height','wave_direction','wave_period','swell_wave_height','swell_wave_direction','swell_wave_period','secondary_swell_wave_height','secondary_swell_wave_period','secondary_swell_wave_direction','wind_wave_height','sea_surface_temperature','sea_level_height_msl','ocean_current_velocity','ocean_current_direction'].join(','),
    ...timeParams(lat, lon, opts), wind_speed_unit: 'ms',
  });
}
function buildWeatherParams(lat, lon, opts) {
  return new URLSearchParams({ latitude: lat.toString(), longitude: lon.toString(), hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,uv_index', ...timeParams(lat, lon, opts), wind_speed_unit: 'ms' });
}
function buildMarineModelsParams(lat, lon, opts) {
  return new URLSearchParams({ latitude: lat.toString(), longitude: lon.toString(), hourly: 'wave_height', models: WAVE_MODELS.join(','), ...timeParams(lat, lon, opts) });
}
function buildWindModelsParams(lat, lon, opts) {
  return new URLSearchParams({ latitude: lat.toString(), longitude: lon.toString(), hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m', models: WIND_MODELS.join(','), ...timeParams(lat, lon, opts), wind_speed_unit: 'ms' });
}
function createUpdateConditionsFetcher({ marineApi, weatherApi, fetchWithRetry }) {
  const local = (lat, lon) => (json) => localizeHourly(json, spotTimeZone({ lat, lon }));
  return {
    fetchMarineData: (lat, lon, usage) => fetchWithRetry(`${marineApi}?${buildMarineParams(lat, lon)}`, 3, 1000, usage, 1).then(local(lat, lon)),
    fetchWeatherData: (lat, lon, usage) => fetchWithRetry(`${weatherApi}?${buildWeatherParams(lat, lon)}`, 3, 1000, usage, 1).then(local(lat, lon)),
    fetchMarineWaveModels: (lat, lon, usage) => fetchWithRetry(`${marineApi}?${buildMarineModelsParams(lat, lon)}`, 3, 1000, usage, WAVE_MODELS.length).then(local(lat, lon)),
    fetchWindModels: (lat, lon, usage) => fetchWithRetry(`${weatherApi}?${buildWindModelsParams(lat, lon)}`, 3, 1000, usage, WIND_MODELS.length).then(local(lat, lon)),
  };
}
module.exports = { FORECAST_DAYS, buildMarineParams, buildWeatherParams, buildMarineModelsParams, buildWindModelsParams, createUpdateConditionsFetcher };
