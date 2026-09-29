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
  loadTidesLayerStatus,
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

function getCurrentConditions(marineData, weatherData, ihTideObs, tideBaseline) {
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
    ...require('./lib/updateConditionsPure').uvIndexFields(weatherData.hourly, weatherTimeIndex),
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
    // Anomalia de maré (Fase B): a obs é vs ZH e a previsão vs MSL, e o
    // resíduo cru oscila ±0.5 m com a fase da maré (amplitude real ≠ modelo).
    // O baseline por estação guarda amostras [t, resíduo] e a anomalia
    // compara só contra resíduos da mesma fase M2 (10–15 h atrás) — sem
    // cobertura de fase, omite (nunca inventa).
    if (tideBaseline && ihTideObs.codp != null) {
      const tideAnomaly = require('./lib/tideAnomaly');
      const key = String(ihTideObs.codp);
      const entry = tideBaseline.stations[key];
      const anomaly = tideAnomaly.tideAnomalyM({
        obsZh: ihTideObs.lastObs,
        predMsl: seaLevel,
        entry,
        nowMs: Date.now(),
      });
      if (anomaly !== null) result.tideAnomalyM = anomaly;
      // O resíduo desta run entra no baseline DEPOIS de calcular a anomalia
      // — a amostra corrente não se julga a si mesma. Uma vez por estação:
      // vários spots partilham o mesmo codp/maregrafo.
      // instanceof e não truthy: um baseline carregado do disco traz
      // _recorded serializado como {} (Set → JSON) — recriar em vez de
      // rebentar em .has(). O Set é apagado antes de persistir.
      if (!(tideBaseline._recorded instanceof Set)) tideBaseline._recorded = new Set();
      if (!tideBaseline._recorded.has(key)) {
        tideBaseline._recorded.add(key);
        tideAnomaly.recordResidual(
          tideBaseline.stations,
          ihTideObs.codp,
          ihTideObs.lastObs - seaLevel,
          ihTideObs.lastData,
        );
      }
    }
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
  // Baseline de anomalia de maré (Fase B): resíduos crus obsZH−predMSL por
  // estação, rolling — scripts/calibrate-tide-baseline.js semeia, cada run
  // refina. Em data-state como os outros archives (sobrevive ao artefacto).
  const tideBaselinePath = path.join(__dirname, '../data-state/tide-anomaly-baseline.json');
  const tideBaseline = readJsonIfExists(
    tideBaselinePath,
    { stations: {} },
    () => console.warn('⚠️ Could not parse tide-anomaly-baseline.json — anomaly hidden until it accumulates again'),
  );
  if (!tideBaseline.stations || typeof tideBaseline.stations !== 'object') tideBaseline.stations = {};
  // Ensemble P10/P50/P90 coverage for the run summary (see ensembleQuantiles.js).
  const ensembleRun = { spots: 0, hours: 0 };
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
        useMultiModel, previousConditions, ihTides, tideBaseline, waveBias, waveBiasEnabled, usage,
        fetchers: { fetchMarineData, fetchWeatherData, fetchMarineWaveModels, fetchWindModels },
        findCurrentHourIndex, confidenceAtIndex, confidenceByDay, blendWindAtIndex, readModelMap,
        applyWindBlendToHours, waveModels: WAVE_MODELS, windModels: WIND_MODELS, isFreshIhObservation,
        getCurrentConditions, onStaleIhTide: () => { ihSkippedStale += 1; },
        modelHealthRun, modelHealth: { mergeCounts, countModelSlots, HEALTH_FAMILIES },
      });
      allConditions[spot.id] = result.conditions;
      allForecasts[spot.id] = result.forecast;
      if (result.ensembleHours > 0) {
        ensembleRun.spots += 1;
        ensembleRun.hours += result.ensembleHours;
      }
      usage.spotsFetched += 1;
      await sleep(MIN_REQUEST_INTERVAL);
    } catch (error) {
      console.error(`  ✗ ${spot.id} failed:`, error.message);
    }
  }
  applyAliasSpots(aliasSpots, allConditions, allForecasts);
  // European AQI (fetch-air-quality.js → air-quality.json): camada suave —
  // merge só quando o ficheiro é fresco (<8h); um outage AQ nunca bloqueia.
  const airQualityPath = path.join(__dirname, '../public/data/air-quality.json');
  const airQuality = readJsonIfExists(airQualityPath, null, () => console.warn('⚠️ Could not parse air-quality.json — AQI chip hidden this run'));
  if (airQuality?.spots && airQuality.generatedAt) {
    const aqAgeH = (Date.now() - new Date(airQuality.generatedAt).getTime()) / 3_600_000;
    if (aqAgeH <= 8) {
      let aqMerged = 0;
      for (const [spotId, conditions] of Object.entries(allConditions)) {
        const entry = airQuality.spots[spotId];
        if (entry && entry.aqi != null && Number.isFinite(Number(entry.aqi))) {
          conditions.airQualityIndex = Number(entry.aqi);
          conditions.airQualityAt = entry.at;
          aqMerged += 1;
        }
      }
      console.log(`🌫 AQI merged into ${aqMerged} spots (file ${aqAgeH.toFixed(1)}h old)`);
    } else {
      console.warn(`⚠️ air-quality.json ${aqAgeH.toFixed(1)}h old (>8h) — AQI chip hidden this run`);
    }
  }
  if (ihSkippedStale > 0) console.warn(`⚠️ Skipped stale IH observed tide on ${ihSkippedStale} spots (lastData > ${MAX_OBS_AGE_HOURS}h) — forecast tides stay on Open-Meteo`);
  // Corrente MEDIDA por radar HF (fetch-hfr-currents.js → hfr-currents.json,
  // EMODnet/IH Lisboa — Sines→Peniche). Camada suave como o AQI: só entra
  // quando o grid é fresco (<6h); um outage nunca bloqueia.
  const hfrPath = path.join(__dirname, '../public/data/hfr-currents.json');
  const hfr = readJsonIfExists(hfrPath, null, () => console.warn('⚠️ Could not parse hfr-currents.json — measured current hidden this run'));
  if (hfr?.spots && hfr.time) {
    const hfrAgeH = require('./lib/hfrCurrents').gridAgeHours(hfr.time);
    if (hfrAgeH <= require('./lib/hfrCurrents').MAX_AGE_HOURS) {
      let hfrMerged = 0;
      for (const [spotId, conditions] of Object.entries(allConditions)) {
        const entry = hfr.spots[spotId];
        if (entry && Number.isFinite(Number(entry.spd)) && Number.isFinite(Number(entry.dir))) {
          conditions.currentMeasuredSpeed = Number(entry.spd);
          conditions.currentMeasuredDir = Number(entry.dir);
          conditions.currentMeasuredAt = hfr.time;
          conditions.currentMeasuredNetwork = hfr.network;
          hfrMerged += 1;
        }
      }
      console.log(`📡 HFR measured current merged into ${hfrMerged} spots (grid ${hfrAgeH.toFixed(1)}h old)`);
    } else {
      console.warn(`⚠️ hfr-currents.json grid ${hfrAgeH.toFixed(1)}h old (>6h) — measured current hidden this run`);
    }
  }
  // Qualidade da água balnear (fetch-water-quality.js → water-quality.json,
  // APA InfoÁgua — conselho balnear + classe anual + alertas). Dados
  // semanais/sazonais: gate solto de 14 dias; a validade real é a época
  // balnear, avaliada no render com as datas do próprio registo.
  const wqPath = path.join(__dirname, '../public/data/water-quality.json');
  const waterQuality = readJsonIfExists(wqPath, null, () => console.warn('⚠️ Could not parse water-quality.json — APA quality hidden this run'));
  if (waterQuality?.spots && waterQuality.generatedAt) {
    const wqAgeD = (Date.now() - new Date(waterQuality.generatedAt).getTime()) / 86_400_000;
    if (wqAgeD <= 14) {
      let wqMerged = 0;
      for (const [spotId, conditions] of Object.entries(allConditions)) {
        const entry = waterQuality.spots[spotId];
        if (entry && entry.beach) {
          conditions.waterQuality = entry;
          wqMerged += 1;
        }
      }
      console.log(`💧 APA water quality merged into ${wqMerged} spots (file ${wqAgeD.toFixed(1)}d old)`);
    } else {
      console.warn(`⚠️ water-quality.json ${wqAgeD.toFixed(1)}d old (>14d) — APA quality hidden this run`);
    }
  }
  // Persiste o baseline de anomalia (mesmo sem anomalias emitidas — os
  // resíduos desta run contam para a mediana das próximas).
  try {
    tideBaseline.updatedAt = new Date().toISOString();
    // O Set de dedupe é estado intra-run — serializaria como {} e
    // corromperia a próxima run (.has is not a function).
    delete tideBaseline._recorded;
    ensureParentDir(tideBaselinePath);
    atomicWriteJson(tideBaselinePath, tideBaseline);
    const anomalySpots = Object.values(allConditions).filter((c) => c.tideAnomalyM != null).length;
    if (anomalySpots > 0) console.log(`🌊 Tide anomaly emitted on ${anomalySpots} spots (baseline ${Object.keys(tideBaseline.stations).length} stations)`);
  } catch (err) {
    console.warn('⚠️ Failed to persist tide-anomaly-baseline.json:', err.message);
  }
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
  // Espelha o directorio ao indice: um spot cujo fetch falhou (o gate de
  // coverage tolera ate 5%) fica fora de forecasts.json, mas o ficheiro do
  // run anterior - commitado - ficava no disco e o validador
  // (forecasts.splitFiles) falhava com "N file(s) without key", matando o
  // pipeline em loop (2026-09-07: castelo-neiva, anjos). O indice e a
  // verdade; cada remocao e nomeada para ser auditavel.
  let staleRemoved = 0;
  for (const file of fs.readdirSync(perSpotDir)) {
    if (!file.endsWith('.json')) continue;
    const id = file.replace(/\.json$/, '');
    if (!Object.prototype.hasOwnProperty.call(allForecasts, id)) {
      fs.unlinkSync(path.join(perSpotDir, file));
      staleRemoved++;
      console.warn(`  🗑 Removed stale per-spot forecast ${file} - spot absent from this run's forecasts.json (fetch failed or spot removed)`);
    }
  }
  if (staleRemoved > 0) console.warn(`⚠️ Removed ${staleRemoved} stale per-spot forecast file(s) - index/dir now consistent`);
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
    // Cobertura da banda P10/P90 gravada nas horas de previsão: um zero aqui
    // com modelos vivos significa que a ligação ao ensembleQuantiles partiu.
    console.log(`📊 Banda horária P10/P50/P90: ${ensembleRun.hours} horas em ${ensembleRun.spots}/${usage.spotsFetched} spots (${WAVE_MODELS.length} onda + ${WIND_MODELS.length} vento)`);
    if (ensembleRun.hours === 0 && modelHealthRun.sampledSpots > 0) {
      console.log('::warning title=Banda ensemble em falta::Nenhuma hora recebeu P10/P50/P90 apesar de haver modelos vivos — ver ensembleQuantiles.attachEnsemble');
    }
    await notifyDeadModels(healthReport);
    writeModelHealth(healthReport);
  } else console.log('ℹ️ Modo noite: sem dados multi-modelo — health-check de modelos não aplicável.');
  const weightedPerSpot = useMultiModel ? 2 + WAVE_MODELS.length + WIND_MODELS.length : 2;
  const dailyBudgetPct = ((usage.weightedCalls / 10000) * 100).toFixed(1);
  console.log(`\n📊 Open-Meteo usage (real): ${usage.weightedCalls} chamadas ponderadas (${usage.requests} pedidos HTTP, ${usage.retries} retries) · ${usage.spotsFetched} spots · ${weightedPerSpot} ponderadas/spot · ${dailyBudgetPct}% do orçamento diário (10k)`);
  const metaRoot = path.join(__dirname, '..');
  const prevMeta = readPipelineMeta(metaRoot);
  // Quota diária (P2 do audit 2026-09-22): o log acima é por-run, mas o
  // orçamento Open-Meteo é por dia UTC — acumula across runs na meta e
  // avisa quando a folga desaparece (~8,2k/dia estimados de 10k).
  const usageDayUtc = new Date().toISOString().slice(0, 10);
  const prevUsage = prevMeta?.openMeteoUsage;
  const prevDayUtc = typeof prevUsage?.dayUtc === 'string' ? prevUsage.dayUtc : null;
  const dailyWeightedCalls =
    (prevDayUtc === usageDayUtc ? Number(prevUsage?.dailyWeightedCalls) || 0 : 0) + usage.weightedCalls;
  const dailyBudgetUsedPct = (dailyWeightedCalls / 10000) * 100;
  if (dailyBudgetUsedPct >= 80) {
    const line = `⚠️ Open-Meteo quota diária: ${dailyWeightedCalls}/10000 (${dailyBudgetUsedPct.toFixed(1)}%) — folga a esgotar`;
    console.log(line);
    console.log(`::warning title=Open-Meteo quota::${line}`);
  }
  const { buoyLayer, radarLayer, warningsLayer, coastalWarningsLayer, tideLayer } = buildPipelineLayers({ metaRoot, previousMeta: prevMeta, loadBuoyLayerStatus, applyBuoyLayerStreak, loadRadarLayerStatus, loadWarningsLayerStatus, applyLayerStreak, buildCoastalWarningsLayer, loadTidesLayerStatus });
  writePipelineMeta('full', new Date(), metaRoot, { buoyLayer, radarLayer, warningsLayer, coastalWarningsLayer, tideLayer, openMeteoUsage: { weightedCalls: usage.weightedCalls, requests: usage.requests, retries: usage.retries, spotsFetched: usage.spotsFetched, mode: useMultiModel ? 'day' : 'night', weightedPerSpot, waveModels: WAVE_MODELS.length, windModels: WIND_MODELS.length, dayUtc: usageDayUtc, dailyWeightedCalls } });
  if (buoyLayer) console.log(`🌊 Camada de boias: ${buoyLayer.status} (key ${buoyLayer.apiKeyConfigured ? '✓' : '✗'}, wave data ${buoyLayer.hasWaveData ? '✓' : '✗'}${buoyLayer.newestReadingAt ? `, última leitura ${buoyLayer.newestReadingAt}` : ''}${buoyLayer.streak > 0 ? `, streak down/stale: ${buoyLayer.streak} runs` : ''})`);
  else console.log('🌊 Camada de boias: sem ih-buoys.json (primeiro run)');
  if (radarLayer) console.log(`📡 Camada de radar: ${radarLayer.status}${radarLayer.frameTime ? ` · frame ${radarLayer.frameTime}` : ''}${radarLayer.streak > 0 ? `, streak down/stale: ${radarLayer.streak} runs` : ''}`);
  else console.log('📡 Camada de radar: sem radar.json (primeiro run)');
  if (warningsLayer) console.log(`⚠️  Camada de avisos: ${warningsLayer.status} · ${warningsLayer.activeWarnings ?? 0} avisos activos (${warningsLayer.source ?? '?'}${warningsLayer.fetchedAt ? `, ${warningsLayer.fetchedAt}` : ''})${warningsLayer.streak > 0 ? `, streak down/stale: ${warningsLayer.streak} runs` : ''}`);
  else console.log('⚠️  Camada de avisos: sem warnings.json (primeiro run)');
  if (coastalWarningsLayer) console.log(`⚓ Camada de avisos costeiros: ${coastalWarningsLayer.status} · ${coastalWarningsLayer.activeWarnings ?? 0} avisos em vigor, ${coastalWarningsLayer.coveredSpots ?? 0} spots cobertos${coastalWarningsLayer.fetchedAt ? ` · fetch ${coastalWarningsLayer.fetchedAt}` : ''}${coastalWarningsLayer.streak > 0 ? `, streak down/stale: ${coastalWarningsLayer.streak} runs` : ''}`);
  else console.log('⚓ Camada de avisos costeiros: sem ih-coastal-warnings.json (primeiro run)');
  if (tideLayer) console.log(`🌊 Camada de marés IH: ${tideLayer.status} · ${tideLayer.stations ?? 0} estações, ${tideLayer.mappedSpots ?? 0} spots${tideLayer.fetchedAt ? ` · fetch ${tideLayer.fetchedAt}` : ''}${tideLayer.streak > 0 ? `, streak down/stale: ${tideLayer.streak} runs` : ''}`);
  else console.log('🌊 Camada de marés IH: sem ih-tides.json (primeiro run)');
}

if (require.main === module) {
  updateConditions().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { parseSpotsFromFile, applyWaveBiasToRow, applyAliasSpots, resolveUseMultiModel, confidenceFromPrevious, createUsageCounter, fetchWithRetry, spots, MIN_SPOTS };
