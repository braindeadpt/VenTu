const { confidenceFromPrevious, applyWaveBiasToRow } = require('./updateConditionsPure');
const { buildConditionsRow, mergeForecast } = require('./updateConditionsMerge');
const { attachEnsemble, inheritEnsemble } = require('./ensembleQuantiles');

async function processSpot(spot, options) {
  const {
    useMultiModel, previousConditions, ihTides, waveBias, waveBiasEnabled,
    usage, fetchers, findCurrentHourIndex, confidenceAtIndex, confidenceByDay,
    blendWindAtIndex, readModelMap, applyWindBlendToHours, waveModels, windModels,
    isFreshIhObservation, log = console,
  } = options;
  log.log(`  Fetching ${spot.id}...`);
  let marineData;
  let weatherData;
  let confidenceDetail;
  let dailyConfidence;
  // Ensemble members kept for the forecast band (see ensembleQuantiles.js) —
  // they arrive in the same two payloads the daytime run already fetches.
  let waveModelsHourly = null;
  let currentWeatherData;
  if (useMultiModel) {
    const [marine, weather, marineWaveModels, windModelData] = await Promise.all([
      fetchers.fetchMarineData(spot.lat, spot.lon, usage),
      fetchers.fetchWeatherData(spot.lat, spot.lon, usage),
      fetchers.fetchMarineWaveModels(spot.lat, spot.lon, usage),
      fetchers.fetchWindModels(spot.lat, spot.lon, usage),
    ]);
    marineData = marine;
    // Mantém `weatherData` com a série `best_match` original (sem misturar ainda)
    // para que `mergeForecast` + `applyWindBlendToHours` misturem cada hora UMA SÓ VEZ.
    // `currentWeatherData` leva apenas a hora atual misturada uma vez para `getCurrentConditions`.
    weatherData = { ...weather, _windModelsHourly: windModelData.hourly };
    if (options.modelHealthRun && options.modelHealth) {
      const { mergeCounts, countModelSlots, HEALTH_FAMILIES } = options.modelHealth;
      mergeCounts(
        options.modelHealthRun.waveCounts,
        countModelSlots(marineWaveModels.hourly, HEALTH_FAMILIES.wave.baseKey, HEALTH_FAMILIES.wave.models),
      );
      mergeCounts(
        options.modelHealthRun.windCounts,
        countModelSlots(windModelData.hourly, HEALTH_FAMILIES.wind.baseKey, HEALTH_FAMILIES.wind.models),
      );
      options.modelHealthRun.sampledSpots += 1;
    }
    const weatherIdx = Math.min(findCurrentHourIndex(weather.hourly.time), weather.hourly.wind_speed_10m.length - 1);
    const windIdx = Math.min(findCurrentHourIndex(windModelData.hourly.time), (windModelData.hourly.time?.length ?? 1) - 1);
    const baseSpd = weather.hourly.wind_speed_10m[weatherIdx];
    const baseDir = weather.hourly.wind_direction_10m[weatherIdx];
    const baseGust = weather.hourly.wind_gusts_10m[weatherIdx];
    const blend = blendWindAtIndex(baseSpd, baseDir, baseGust, readModelMap(windModelData.hourly, 'wind_speed_10m', windModels, windIdx), readModelMap(windModelData.hourly, 'wind_direction_10m', windModels, windIdx), readModelMap(windModelData.hourly, 'wind_gusts_10m', windModels, windIdx));
    weatherData._windBlend = blend;
    currentWeatherData = {
      ...weatherData,
      hourly: {
        ...weather.hourly,
        wind_speed_10m: weather.hourly.wind_speed_10m.map((v, i) => (i === weatherIdx && blend.windSpeed != null ? blend.windSpeed : v)),
        wind_direction_10m: weather.hourly.wind_direction_10m.map((v, i) => (i === weatherIdx && blend.windDirection != null ? blend.windDirection : v)),
        wind_gusts_10m: weather.hourly.wind_gusts_10m.map((v, i) => (i === weatherIdx && blend.windGust != null ? blend.windGust : v)),
      },
    };
    confidenceDetail = confidenceAtIndex(marineWaveModels, windModelData, findCurrentHourIndex(marineWaveModels.hourly.time));
    dailyConfidence = confidenceByDay(marineWaveModels, windModelData);
    waveModelsHourly = marineWaveModels.hourly;
  } else {
    [marineData, weatherData] = await Promise.all([fetchers.fetchMarineData(spot.lat, spot.lon, usage), fetchers.fetchWeatherData(spot.lat, spot.lon, usage)]);
    currentWeatherData = weatherData;
    const inherited = confidenceFromPrevious(previousConditions[spot.id]);
    confidenceDetail = { confidence: inherited.confidence, ...inherited.confidenceDetail };
    dailyConfidence = inherited.dailyConfidence;
  }
  const mapping = ihTides.spotMapping?.[spot.id];
  let ihTideObs = null;
  if (mapping) {
    const station = ihTides.stations?.[mapping.codp];
    if (station && isFreshIhObservation(station.lastData)) ihTideObs = { codp: station.codp ?? mapping.codp, lastObs: station.lastObs, lastData: station.lastData, stationTitle: station.title };
    else if (station) options.onStaleIhTide?.();
  }
  const current = options.getCurrentConditions(marineData, currentWeatherData, ihTideObs, options.tideBaseline);
  const biasRow = applyWaveBiasToRow(current, spot.region, waveBias, waveBiasEnabled);
  if (biasRow.waveBias) log.log(`  ↳ ${spot.id}: waveHeight ${biasRow.waveHeightRaw} → ${biasRow.waveHeight} m (bias ${biasRow.waveBias.me >= 0 ? '+' : ''}${biasRow.waveBias.me} m, n=${biasRow.waveBias.n})`);
  const conditions = buildConditionsRow(marineData, currentWeatherData, current, biasRow, confidenceDetail, dailyConfidence, useMultiModel);
  const forecast = mergeForecast(marineData, weatherData);
  // Quantiles come from the raw members, so they are attached before the wind
  // blend rewrites the row's central windSpeed: `windP50` is the ensemble
  // median while the row value stays the product wind (ICON-EU floor).
  let ensembleHours = 0;
  let ensUpdatedAt = null;
  if (waveModelsHourly) {
    ensembleHours = attachEnsemble(forecast, {
      marineHourly: waveModelsHourly,
      windHourly: weatherData._windModelsHourly ?? null,
      waveModels,
      windModels,
    }).hours;
    if (ensembleHours > 0) ensUpdatedAt = conditions.updatedAt;
  } else if (options.readPreviousForecast) {
    const prevEnsAt = previousConditions[spot.id]?.ensUpdatedAt ?? previousConditions[spot.id]?.updatedAt;
    ensembleHours = inheritEnsemble(forecast, options.readPreviousForecast(spot.id), {
      previousUpdatedAt: prevEnsAt,
    });
    if (ensembleHours > 0 && prevEnsAt) ensUpdatedAt = prevEnsAt;
  }
  if (ensUpdatedAt) conditions.ensUpdatedAt = ensUpdatedAt;
  if (weatherData._windModelsHourly) applyWindBlendToHours(forecast, weatherData._windModelsHourly, windModels);
  log.log(`  ✓ ${spot.id} updated${ihTideObs ? ` (IH tide: ${ihTideObs.lastObs}m)` : ''}`);
  return { conditions, forecast, ensembleHours };
}
module.exports = { processSpot };
