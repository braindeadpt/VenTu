const { WAVE_MODELS, WIND_MODELS } = require('./forecastConfidence');
const { LISBON_TZ } = require('./spotTimeZone');

// Fuso do SPOT (Atlantic/Azores para os Açores — ver scripts/lib/spotTimeZone.js):
// as horas «naive» devolvidas ficam na hora local que o utilizador vê.
function buildMarineParams(lat, lon, timeZone = LISBON_TZ) {
  return new URLSearchParams({
    latitude: lat.toString(), longitude: lon.toString(),
    hourly: ['wave_height','wave_direction','wave_period','swell_wave_height','swell_wave_direction','swell_wave_period','secondary_swell_wave_height','secondary_swell_wave_period','secondary_swell_wave_direction','wind_wave_height','sea_surface_temperature','sea_level_height_msl','ocean_current_velocity','ocean_current_direction'].join(','),
    timezone: timeZone, forecast_days: '7', wind_speed_unit: 'ms',
  });
}
function buildWeatherParams(lat, lon, timeZone = LISBON_TZ) {
  return new URLSearchParams({ latitude: lat.toString(), longitude: lon.toString(), hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m', timezone: timeZone, forecast_days: '7', wind_speed_unit: 'ms' });
}
function buildMarineModelsParams(lat, lon, timeZone = LISBON_TZ) {
  return new URLSearchParams({ latitude: lat.toString(), longitude: lon.toString(), hourly: 'wave_height', models: WAVE_MODELS.join(','), timezone: timeZone, forecast_days: '7' });
}
function buildWindModelsParams(lat, lon, timeZone = LISBON_TZ) {
  return new URLSearchParams({ latitude: lat.toString(), longitude: lon.toString(), hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m', models: WIND_MODELS.join(','), timezone: timeZone, forecast_days: '7' });
}
function createUpdateConditionsFetcher({ marineApi, weatherApi, fetchWithRetry }) {
  return {
    fetchMarineData: (lat, lon, usage, timeZone) => fetchWithRetry(`${marineApi}?${buildMarineParams(lat, lon, timeZone)}`, 3, 1000, usage, 1),
    fetchWeatherData: (lat, lon, usage, timeZone) => fetchWithRetry(`${weatherApi}?${buildWeatherParams(lat, lon, timeZone)}`, 3, 1000, usage, 1),
    fetchMarineWaveModels: (lat, lon, usage, timeZone) => fetchWithRetry(`${marineApi}?${buildMarineModelsParams(lat, lon, timeZone)}`, 3, 1000, usage, WAVE_MODELS.length),
    fetchWindModels: (lat, lon, usage, timeZone) => fetchWithRetry(`${weatherApi}?${buildWindModelsParams(lat, lon, timeZone)}`, 3, 1000, usage, WIND_MODELS.length),
  };
}
module.exports = { buildMarineParams, buildWeatherParams, buildMarineModelsParams, buildWindModelsParams, createUpdateConditionsFetcher };
