const { wavePowerFromMarine, seriesMean, finiteOrNull, tideFromSeries } = require('./updateConditionsPure');

/** SMOC surface current. Missing arrays (tests, older payloads) → slack water. */
function readOceanCurrent(hourly, i) {
  const spd = Number(hourly?.ocean_current_velocity?.[i]);
  const dir = Number(hourly?.ocean_current_direction?.[i]);
  return {
    currentSpeed: Number.isFinite(spd) && spd > 0 ? Math.round(spd * 100) / 100 : 0,
    currentDir: Number.isFinite(dir) ? ((Math.round(dir) % 360) + 360) % 360 : 0,
  };
}

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

/**
 * Linhas horárias do forecast. Auditoria de dados 16/10:
 * - M2: um valor em falta na fonte fica `null` (antes `|| 0` virava «0 kt /
 *   0 m / 0 °C»). A UI diz «sem dados» e o motor v6 não avalia essa hora.
 * - A4: `tideHeight` é a maré relativa ao nível médio da PRÓPRIA série
 *   (retira-se a média de `sea_level_height_msl`, deslocada −0,35 a −0,41 m
 *   no continente); `horaSpot.ts` soma o nível médio do porto IH.
 */
function mergeForecast(marineData, weatherData) {
  const result = [];
  const mh = marineData.hourly;
  const wh = weatherData.hourly;
  const maxHours = Math.min(mh.time.length, wh.time.length, 168);
  const tideMean = seriesMean(mh.sea_level_height_msl);
  for (let i = 0; i < maxHours; i += 1) {
    const fh = finiteOrNull(mh.wave_height?.[i]);
    const ft = finiteOrNull(mh.wave_period?.[i]);
    const fSwellH = finiteOrNull(mh.swell_wave_height?.[i]);
    const fSwellT = finiteOrNull(mh.swell_wave_period?.[i]);
    result.push({
      time: mh.time[i], waveHeight: fh, wavePeriod: ft,
      waveDirection: finiteOrNull(mh.wave_direction?.[i]),
      swellHeight: fSwellH, swellPeriod: fSwellT,
      swellDirection: finiteOrNull(mh.swell_wave_direction?.[i]),
      windWaveHeight: finiteOrNull(mh.wind_wave_height?.[i]),
      wavePowerKw:
        fh == null && fSwellH == null
          ? null
          : wavePowerFromMarine({ swellHeight: fSwellH ?? 0, swellPeriod: fSwellT ?? 0, waveHeight: fh ?? 0, wavePeriod: ft ?? 0 }),
      windSpeed: finiteOrNull(wh.wind_speed_10m?.[i]),
      windDirection: finiteOrNull(wh.wind_direction_10m?.[i]),
      windGust: finiteOrNull(wh.wind_gusts_10m?.[i]),
      waterTemp: finiteOrNull(mh.sea_surface_temperature?.[i]),
      ...(Number.isFinite(Number(wh.temperature_2m?.[i])) && wh.temperature_2m?.[i] != null
        ? { airTemp: Math.round(Number(wh.temperature_2m[i]) * 10) / 10 }
        : {}),
      // uv_index: `Number(null) === 0` — null da série significa «sem
      // dados», nunca «UV 0». Só emitimos o campo com valor real.
      ...(wh.uv_index?.[i] != null &&
        Number.isFinite(Number(wh.uv_index[i]))
        ? { uvIndex: Math.round(Number(wh.uv_index[i]) * 10) / 10 }
        : {}),
      tideHeight: tideFromSeries(mh.sea_level_height_msl?.[i], tideMean),
      ...readOceanCurrent(mh, i),
    });
  }
  return result;
}

module.exports = { buildConditionsRow, mergeForecast, readOceanCurrent };
