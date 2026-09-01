const { confidenceFromPrevious, applyWaveBiasToRow } = require('./updateConditionsPure');
const { buildConditionsRow, mergeForecast } = require('./updateConditionsMerge');

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
  if (useMultiModel) {
    const [marine, weather, marineWaveModels, windModelData] = await Promise.all([
      fetchers.fetchMarineData(spot.lat, spot.lon, usage),
      fetchers.fetchWeatherData(spot.lat, spot.lon, usage),
      fetchers.fetchMarineWaveModels(spot.lat, spot.lon, usage),
      fetchers.fetchWindModels(spot.lat, spot.lon, usage),
    ]);
    marineData = marine;
    weatherData = weather;
    // Reuses the multimodel payloads already fetched — empty counts would
    // make every daytime run report "OK (0 spots amostrados)" and wipe
    // model-health.json.
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
    const weatherIdx = Math.min(findCurrentHourIndex(weatherData.hourly.time), weatherData.hourly.wind_speed_10m.length - 1);
    const windIdx = Math.min(findCurrentHourIndex(windModelData.hourly.time), (windModelData.hourly.time?.length ?? 1) - 1);
    const blend = blendWindAtIndex(weatherData.hourly.wind_speed_10m[weatherIdx] || 0, weatherData.hourly.wind_direction_10m[weatherIdx] || 0, weatherData.hourly.wind_gusts_10m[weatherIdx] || 0, readModelMap(windModelData.hourly, 'wind_speed_10m', windModels, windIdx), readModelMap(windModelData.hourly, 'wind_direction_10m', windModels, windIdx), readModelMap(windModelData.hourly, 'wind_gusts_10m', windModels, windIdx));
    weatherData = { ...weatherData, hourly: { ...weatherData.hourly, wind_speed_10m: weatherData.hourly.wind_speed_10m.map((v, i) => i === weatherIdx ? blend.windSpeed : v), wind_direction_10m: weatherData.hourly.wind_direction_10m.map((v, i) => i === weatherIdx ? blend.windDirection : v), wind_gusts_10m: weatherData.hourly.wind_gusts_10m.map((v, i) => i === weatherIdx ? blend.windGust : v) }, _windBlend: blend, _windModelsHourly: windModelData.hourly };
    confidenceDetail = confidenceAtIndex(marineWaveModels, windModelData, findCurrentHourIndex(marineWaveModels.hourly.time));
    dailyConfidence = confidenceByDay(marineWaveModels, windModelData);
  } else {
    [marineData, weatherData] = await Promise.all([fetchers.fetchMarineData(spot.lat, spot.lon, usage), fetchers.fetchWeatherData(spot.lat, spot.lon, usage)]);
    const inherited = confidenceFromPrevious(previousConditions[spot.id]);
    confidenceDetail = { confidence: inherited.confidence, ...inherited.confidenceDetail };
    dailyConfidence = inherited.dailyConfidence;
  }
  const mapping = ihTides.spotMapping?.[spot.id];
  let ihTideObs = null;
  if (mapping) {
    const station = ihTides.stations?.[mapping.codp];
    if (station && isFreshIhObservation(station.lastData)) ihTideObs = { lastObs: station.lastObs, lastData: station.lastData, stationTitle: station.title };
    else if (station) options.onStaleIhTide?.();
  }
  const current = options.getCurrentConditions(marineData, weatherData, ihTideObs);
  const biasRow = applyWaveBiasToRow(current, spot.region, waveBias, waveBiasEnabled);
  if (biasRow.waveBias) log.log(`  ↳ ${spot.id}: waveHeight ${biasRow.waveHeightRaw} → ${biasRow.waveHeight} m (bias ${biasRow.waveBias.me >= 0 ? '+' : ''}${biasRow.waveBias.me} m, n=${biasRow.waveBias.n})`);
  const conditions = buildConditionsRow(marineData, weatherData, current, biasRow, confidenceDetail, dailyConfidence, useMultiModel);
  const forecast = mergeForecast(marineData, weatherData);
  if (weatherData._windModelsHourly) applyWindBlendToHours(forecast, weatherData._windModelsHourly, windModels);
  log.log(`  ✓ ${spot.id} updated${ihTideObs ? ` (IH tide: ${ihTideObs.lastObs}m)` : ''}`);
  return { conditions, forecast };
}
module.exports = { processSpot };
