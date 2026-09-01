const { findCurrentHourIndex } = require('./forecastConfidence');
const { wavePowerFromMarine } = require('./updateConditionsPure');

function buildConditionsRow(marineData, weatherData, current, biasRow, confidenceDetail, dailyConfidence, useMultiModel) {
  return {
    ...biasRow,
    confidence: confidenceDetail.confidence,
    confidenceDetail: {
      waveSpread: confidenceDetail.waveSpread,
      windSpread: confidenceDetail.windSpread,
      waveSpreadPct: confidenceDetail.waveSpreadPct,
      windSpreadPct: confidenceDetail.windSpreadPct,
      combinedSpreadPct: confidenceDetail.combinedSpreadPct,
      degraded: confidenceDetail.degraded ?? !useMultiModel,
    },
    dailyConfidence,
    ...(weatherData._windBlend ? { windBlend: {
      method: weatherData._windBlend.method,
      blended: weatherData._windBlend.blended,
      modelCount: weatherData._windBlend.modelCount,
    } } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function mergeForecast(marineData, weatherData) {
  const result = [];
  const maxHours = Math.min(marineData.hourly.time.length, weatherData.hourly.time.length, 168);
  for (let i = 0; i < maxHours; i += 1) {
    const fh = marineData.hourly.wave_height[i] || 0;
    const ft = marineData.hourly.wave_period[i] || 0;
    const fSwellH = marineData.hourly.swell_wave_height?.[i] ?? 0;
    const fSwellT = marineData.hourly.swell_wave_period?.[i] ?? 0;
    result.push({
      time: marineData.hourly.time[i], waveHeight: fh, wavePeriod: ft,
      waveDirection: marineData.hourly.wave_direction[i] || 0,
      swellHeight: fSwellH, swellPeriod: fSwellT,
      swellDirection: marineData.hourly.swell_wave_direction?.[i] ?? 0,
      windWaveHeight: marineData.hourly.wind_wave_height?.[i] ?? 0,
      wavePowerKw: wavePowerFromMarine({ swellHeight: fSwellH, swellPeriod: fSwellT, waveHeight: fh, wavePeriod: ft }),
      windSpeed: weatherData.hourly.wind_speed_10m[i] || 0,
      windDirection: weatherData.hourly.wind_direction_10m[i] || 0,
      windGust: weatherData.hourly.wind_gusts_10m[i] || 0,
      waterTemp: marineData.hourly.sea_surface_temperature[i] || 0,
      tideHeight: marineData.hourly.sea_level_height_msl[i] || 0,
    });
  }
  return result;
}

module.exports = { buildConditionsRow, mergeForecast };
