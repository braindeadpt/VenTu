const fs = require('fs');
const path = require('path');

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const MIN_REQUEST_INTERVAL = 200;

const {
  WAVE_MODELS,
  WIND_MODELS,
  confidenceAtIndex,
  confidenceByDay,
  findCurrentHourIndex,
} = require('./lib/forecastConfidence');
const { blendWindAtIndex, readModelMap, applyWindBlendToHours } = require('./lib/windBlend');
const { isMultiModelEnabled: scheduleIsMultiModelEnabled } = require('./lib/updateSchedule');
const { readPipelineMeta, writePipelineMeta } = require('./lib/pipelineMeta');
const { loadBuoyLayerStatus, applyBuoyLayerStreak } = require('./lib/buoyLayerHealth');
const {
  loadRadarLayerStatus,
  loadWarningsLayerStatus,
  buildCoastalWarningsLayer,
  applyLayerStreak,
} = require('./lib/dataLayerHealth');
const {
  HEALTH_FAMILIES,
  countModelSlots,
  mergeCounts,
  buildHealthReport,
  writeModelHealth,
  notifyDeadModels,
} = require('./lib/modelHealth');
const { isFreshIhObservation, MAX_OBS_AGE_HOURS } = require('./lib/ihObservedTide');
const {
  confidenceFromPrevious,
  applyWaveBiasToRow,
  applyAliasSpots,
  MIN_BIAS_N,
  MIN_BIAS_M,
} = require('./lib/updateConditionsPure');
const { readJsonIfExists, atomicWriteJson, ensureParentDir } = require('./lib/updateConditionsArtifacts');
const { createUpdateConditionsFetcher } = require('./lib/updateConditionsFetch');
const { validateCoverage, assertCoverage, buildPipelineLayers } = require('./lib/updateConditionsHealth');
const { processSpot } = require('./lib/updateConditionsPerSpot');

function resolveUseMultiModel() {
  const raw = process.env.VENTU_MULTIMODEL;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return scheduleIsMultiModelEnabled();
}

function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const blockRegex = /\{\s*\n\s*id:\s*['"]([^'"]+)['"]([\s\S]*?)\n\s*\},/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const body = match[2];
    const latMatch = body.match(/lat:\s*([0-9.\-]+)/);
    const lonMatch = body.match(/lon:\s*([0-9.\-]+)/);
    if (!latMatch || !lonMatch) continue;
    const srcMatch = body.match(/conditionsSource:\s*['"]([^'"]+)['"]/);
    const regionMatch = body.match(/region:\s*['"]([^'"]+)['"]/);
    spots.push({
      id: match[1],
      lat: parseFloat(latMatch[1]),
      lon: parseFloat(lonMatch[1]),
      conditionsSource: srcMatch ? srcMatch[1] : undefined,
      region: regionMatch ? regionMatch[1] : undefined,
    });
  }
  const seen = new Set();
  return spots.filter((spot) => {
    if (seen.has(spot.id)) return false;
    seen.add(spot.id);
    return true;
  });
}

const spots = parseSpotsFromFile();
const MIN_SPOTS = 50;
if (spots.length < MIN_SPOTS) {
  console.error(`\n❌ ERROR: Only ${spots.length} spots parsed from spots.ts (expected at least ${MIN_SPOTS}).`);
  console.error('   The regex parser may have failed due to a format change in spots.ts.');
  console.error('   Please check that spots.ts still contains id/lat/lon in the expected format.\n');
  process.exit(1);
}
console.log(`📋 Parsed ${spots.length} spots from src/lib/spots.ts\n`);

const { sleep, createUsageCounter, fetchWithRetry } = require('./lib/updateConditionsIo');
const sourceFetcher = createUpdateConditionsFetcher({ marineApi: MARINE_API, weatherApi: WEATHER_API, fetchWithRetry });
const { fetchMarineData, fetchWeatherData, fetchMarineWaveModels, fetchWindModels } = sourceFetcher;

function getCurrentConditions(marineData, weatherData, ihTideObs) {
  const marineTimeIndex = findCurrentHourIndex(marineData.hourly.time);
  const weatherTimeIndex = Math.min(findCurrentHourIndex(weatherData.hourly.time), weatherData.hourly.wind_speed_10m.length - 1);
  const seaLevel = marineData.hourly.sea_level_height_msl?.[marineTimeIndex] || 0;
  const seaLevelNext = marineData.hourly.sea_level_height_msl?.[marineTimeIndex + 1];
  const tide = require('./lib/updateConditionsPure').getTideStatus(seaLevel, seaLevelNext);
  const waveHeight = marineData.hourly.wave_height[marineTimeIndex] || 0;
  const wavePeriod = marineData.hourly.wave_period[marineTimeIndex] || 0;
  const primary = require('./lib/updateConditionsPure').pickSwellTrain(marineData.hourly.swell_wave_height?.[marineTimeIndex], marineData.hourly.swell_wave_period?.[marineTimeIndex], marineData.hourly.swell_wave_direction?.[marineTimeIndex]);
  const secondary = require('./lib/updateConditionsPure').pickSwellTrain(marineData.hourly.secondary_swell_wave_height?.[marineTimeIndex], marineData.hourly.secondary_swell_wave_period?.[marineTimeIndex], marineData.hourly.secondary_swell_wave_direction?.[marineTimeIndex]);
  const result = {
    waveHeight, wavePeriod, waveDirection: marineData.hourly.wave_direction[marineTimeIndex] || 0,
    swellHeight: primary?.height ?? 0, swellPeriod: primary?.period ?? 0, swellDirection: primary?.direction ?? 0,
    windWaveHeight: marineData.hourly.wind_wave_height?.[marineTimeIndex] ?? 0,
    wavePowerKw: require('./lib/updateConditionsPure').wavePowerFromMarine({ swellHeight: primary?.height ?? 0, swellPeriod: primary?.period ?? 0, waveHeight, wavePeriod }),
    windSpeed: weatherData.hourly.wind_speed_10m[weatherTimeIndex] || 0,
    windDirection: weatherData.hourly.wind_direction_10m[weatherTimeIndex] || 0,
    windGust: weatherData.hourly.wind_gusts_10m[weatherTimeIndex] || 0,
    waterTemp: marineData.hourly.sea_surface_temperature[marineTimeIndex] || 0,
    tideHeight: seaLevel, tideStatus: tide.status, tideLabel: tide.label,
    ...require('./lib/updateConditionsMerge').readOceanCurrent(marineData.hourly, marineTimeIndex),
  };
  if (secondary) {
    result.secondarySwellHeight = secondary.height;
    result.secondarySwellPeriod = secondary.period;
    result.secondarySwellDirection = secondary.direction;
  }
  if (ihTideObs) {
    result.tideObservedHeight = ihTideObs.lastObs;
    result.tideObservedAt = ihTideObs.lastData;
    result.tideStation = ihTideObs.stationTitle;
  }
  return result;
}

async function updateConditions() {
  const useMultiModel = resolveUseMultiModel();
  console.log('🌊 VenTu - Updating conditions...');
  console.log(useMultiModel ? '☀️ Modo dia: best_match + multi-modelo (4 pedidos/spot)' : '🌙 Modo noite: só best_match (2 pedidos/spot) — confiança herdada');
  const outputPath = path.join(__dirname, '../public/data/conditions.json');
  const previousConditions = readJsonIfExists(outputPath, {}, () => console.warn('⚠️ Could not parse existing conditions.json — confidence will reset until daytime run'));
  const allConditions = {};
  const allForecasts = {};
  const modelHealthRun = { waveCounts: {}, windCounts: {}, sampledSpots: 0 };
  const ihTidesPath = path.join(__dirname, '../public/data/ih-tides.json');
  const ihTides = readJsonIfExists(ihTidesPath, { stations: {}, spotMapping: {} }, () => console.warn('⚠️ Could not parse ih-tides.json, continuing without IH tide data\n'));
  if (ihTides.stations && ihTides.spotMapping) console.log(`📡 IH tide data loaded (${Object.keys(ihTides.stations).length} stations, ${Object.keys(ihTides.spotMapping).length} spot mappings)\n`);
  let ihSkippedStale = 0;
  const waveBiasEnabled = process.env.VENTU_WAVE_BIAS_CORRECTION === '1';
  const waveBiasPath = path.join(__dirname, '../public/data/wave-bias.json');
  const waveBias = readJsonIfExists(waveBiasPath, null, () => console.warn('⚠️ Could not parse wave-bias.json, continuing without bias correction'));
  if (waveBiasEnabled && waveBias) console.log(`📏 Wave bias loaded (${Object.keys(waveBias.regions ?? {}).length} regions)\n`);
  const aliasSpots = spots.filter((spot) => spot.conditionsSource);
  const usage = createUsageCounter();
  for (const spot of spots) {
    if (spot.conditionsSource) continue;
    try {
      const result = await processSpot(spot, {
        useMultiModel, previousConditions, ihTides, waveBias, waveBiasEnabled, usage,
        fetchers: { fetchMarineData, fetchWeatherData, fetchMarineWaveModels, fetchWindModels },
        findCurrentHourIndex, confidenceAtIndex, confidenceByDay, blendWindAtIndex, readModelMap,
        applyWindBlendToHours, waveModels: WAVE_MODELS, windModels: WIND_MODELS, isFreshIhObservation,
        getCurrentConditions, onStaleIhTide: () => { ihSkippedStale += 1; },
        modelHealthRun, modelHealth: { mergeCounts, countModelSlots, HEALTH_FAMILIES },
      });
      allConditions[spot.id] = result.conditions;
      allForecasts[spot.id] = result.forecast;
      usage.spotsFetched += 1;
      await sleep(MIN_REQUEST_INTERVAL);
    } catch (error) {
      console.error(`  ✗ ${spot.id} failed:`, error.message);
    }
  }
  applyAliasSpots(aliasSpots, allConditions, allForecasts);
  if (ihSkippedStale > 0) console.warn(`⚠️ Skipped stale IH observed tide on ${ihSkippedStale} spots (lastData > ${MAX_OBS_AGE_HOURS}h) — forecast tides stay on Open-Meteo`);
  const biasApplied = Object.values(allConditions).filter((condition) => condition.waveBias).length;
  if (waveBiasEnabled && biasApplied > 0) console.log(`📏 Bias correction applied on ${biasApplied} spots (n≥${MIN_BIAS_N}, |ME|≥${MIN_BIAS_M} m)`);
  ensureParentDir(outputPath);
  const coverage = validateCoverage(spots, allConditions);
  assertCoverage(coverage);
  atomicWriteJson(outputPath, allConditions);
  const forecastsPath = path.join(__dirname, '../public/data/forecasts.json');
  atomicWriteJson(forecastsPath, allForecasts);
  const perSpotDir = path.join(__dirname, '../public/data/forecasts');
  fs.mkdirSync(perSpotDir, { recursive: true });
  let perSpotCount = 0;
  for (const [dataId, forecast] of Object.entries(allForecasts)) {
    try {
      atomicWriteJson(path.join(perSpotDir, `${dataId}.json`), forecast);
      perSpotCount++;
    } catch (err) {
      console.error(`  ⚠️ Failed to write per-spot forecast for ${dataId}:`, err.message);
    }
  }
  console.log(`\n✅ Conditions saved to ${outputPath}`);
  console.log(`📈 Forecasts saved to ${forecastsPath}`);
  const { buildMapHours } = require('./build-map-hours');
  try {
    buildMapHours(path.join(__dirname, '../public/data'));
  } catch (err) {
    console.warn('⚠️ map-hours.json skipped:', err.message);
  }
  console.log(`📊 Per-spot forecasts: ${perSpotCount} files in ${perSpotDir}`);
  console.log(`📊 Updated ${Object.keys(allConditions).length} spots`);
  if (useMultiModel) {
    const healthReport = buildHealthReport(modelHealthRun);
    if (healthReport.dead.length > 0) {
      const deadList = healthReport.dead.map((dead) => `${dead.model} (${dead.family})`).join(', ');
      console.error(`\n🚨 MODELOS MORTOS (só null): ${deadList}`);
      console.error(`   Amostrados ${modelHealthRun.sampledSpots} spots — os modelos morrem em silêncio e degradam a confiança.`);
      console.error('   Report: public/data/model-health.json · remove o modelo de forecastConfidence.js ou contacta a Open-Meteo.\n');
    } else console.log(`💚 Modelos do ensemble OK (${modelHealthRun.sampledSpots} spots amostrados)`);
    await notifyDeadModels(healthReport);
    writeModelHealth(healthReport);
  } else console.log('ℹ️ Modo noite: sem dados multi-modelo — health-check de modelos não aplicável.');
  const weightedPerSpot = useMultiModel ? 2 + WAVE_MODELS.length + WIND_MODELS.length : 2;
  const dailyBudgetPct = ((usage.weightedCalls / 10000) * 100).toFixed(1);
  console.log(`\n📊 Open-Meteo usage (real): ${usage.weightedCalls} chamadas ponderadas (${usage.requests} pedidos HTTP, ${usage.retries} retries) · ${usage.spotsFetched} spots · ${weightedPerSpot} ponderadas/spot · ${dailyBudgetPct}% do orçamento diário (10k)`);
  const metaRoot = path.join(__dirname, '..');
  const prevMeta = readPipelineMeta(metaRoot);
  const { buoyLayer, radarLayer, warningsLayer, coastalWarningsLayer } = buildPipelineLayers({ metaRoot, previousMeta: prevMeta, loadBuoyLayerStatus, applyBuoyLayerStreak, loadRadarLayerStatus, loadWarningsLayerStatus, applyLayerStreak, buildCoastalWarningsLayer });
  writePipelineMeta('full', new Date(), metaRoot, { buoyLayer, radarLayer, warningsLayer, coastalWarningsLayer, openMeteoUsage: { weightedCalls: usage.weightedCalls, requests: usage.requests, retries: usage.retries, spotsFetched: usage.spotsFetched, mode: useMultiModel ? 'day' : 'night', weightedPerSpot, waveModels: WAVE_MODELS.length, windModels: WIND_MODELS.length } });
  if (buoyLayer) console.log(`🌊 Camada de boias: ${buoyLayer.status} (key ${buoyLayer.apiKeyConfigured ? '✓' : '✗'}, wave data ${buoyLayer.hasWaveData ? '✓' : '✗'}${buoyLayer.newestReadingAt ? `, última leitura ${buoyLayer.newestReadingAt}` : ''}${buoyLayer.streak > 0 ? `, streak down/stale: ${buoyLayer.streak} runs` : ''})`);
  else console.log('🌊 Camada de boias: sem ih-buoys.json (primeiro run)');
  if (radarLayer) console.log(`📡 Camada de radar: ${radarLayer.status}${radarLayer.frameTime ? ` · frame ${radarLayer.frameTime}` : ''}${radarLayer.streak > 0 ? `, streak down/stale: ${radarLayer.streak} runs` : ''}`);
  else console.log('📡 Camada de radar: sem radar.json (primeiro run)');
  if (warningsLayer) console.log(`⚠️  Camada de avisos: ${warningsLayer.status} · ${warningsLayer.activeWarnings ?? 0} avisos activos (${warningsLayer.source ?? '?'}${warningsLayer.fetchedAt ? `, ${warningsLayer.fetchedAt}` : ''})${warningsLayer.streak > 0 ? `, streak down/stale: ${warningsLayer.streak} runs` : ''}`);
  else console.log('⚠️  Camada de avisos: sem warnings.json (primeiro run)');
  if (coastalWarningsLayer) console.log(`⚓ Camada de avisos costeiros: ${coastalWarningsLayer.status} · ${coastalWarningsLayer.activeWarnings ?? 0} avisos em vigor, ${coastalWarningsLayer.coveredSpots ?? 0} spots cobertos${coastalWarningsLayer.fetchedAt ? ` · fetch ${coastalWarningsLayer.fetchedAt}` : ''}${coastalWarningsLayer.streak > 0 ? `, streak down/stale: ${coastalWarningsLayer.streak} runs` : ''}`);
  else console.log('⚓ Camada de avisos costeiros: sem ih-coastal-warnings.json (primeiro run)');
}

if (require.main === module) {
  updateConditions().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { parseSpotsFromFile, applyWaveBiasToRow, applyAliasSpots, resolveUseMultiModel, confidenceFromPrevious, createUsageCounter, fetchWithRetry, spots, MIN_SPOTS };
