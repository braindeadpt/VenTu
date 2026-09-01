/**
 * VenTu - Update Conditions Script
 * Fetches marine + weather data from Open-Meteo for all spots
 * Marine API: waves, sea temp
 * Weather API: wind, gusts
 */

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
  wavePowerKwPerM,
  wavePowerFromMarine,
  pickSwellTrain,
  getTideStatus,
  SWELL_TRAIN_MIN_HEIGHT_M,
} = require('./lib/updateConditionsPure');

function resolveUseMultiModel() {
  const raw = process.env.VENTU_MULTIMODEL;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return scheduleIsMultiModelEnabled();
}

/* Pure calculations live in ./lib/updateConditionsPure. */
/* Legacy implementation retained below temporarily for line-stable review.
function confidenceFromPrevious(prev) {
  if (!prev?.confidenceDetail) {
    return {
      confidence: 'média',
      confidenceDetail: {
        waveSpread: 0,
        windSpread: 0,
        waveSpreadPct: 0,
        windSpreadPct: 0,
        combinedSpreadPct: 0,
        degraded: true,
      },
      dailyConfidence: prev?.dailyConfidence ?? [],
    };
  }
  return {
    confidence: prev.confidence ?? 'média',
    confidenceDetail: {
      waveSpread: prev.confidenceDetail.waveSpread ?? 0,
      windSpread: prev.confidenceDetail.windSpread ?? 0,
      waveSpreadPct: prev.confidenceDetail.waveSpreadPct ?? 0,
      windSpreadPct: prev.confidenceDetail.windSpreadPct ?? 0,
      combinedSpreadPct: prev.confidenceDetail.combinedSpreadPct ?? 0,
      degraded: true,
    },
    dailyConfidence: prev.dailyConfidence ?? [],
  };
}
*/

/**
 * Parse spots from src/lib/spots.ts automatically.
 * No more hardcoded list — add a spot to spots.ts and it gets fetched automatically.
 */
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
  return spots.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

const spots = parseSpotsFromFile();

/**
 * Apply the regional bias to a row and carry its metadata for the UI
 * (waveHeightRaw/waveHeight corrected + waveBias meta). Returns a copy of the
 * row without waveBias when nothing was corrected — pure, testable.
 * @param {{ waveHeight: number }} current getCurrentConditions row
 * @param {string | undefined} region spot region
 * @param {object | null} waveBias wave-bias.json
 * @param {boolean} enabled VENTU_WAVE_BIAS_CORRECTION=1
 * @returns {{ waveHeight: number, waveHeightRaw?: number, waveBias?: object }}
 */
/*
function applyWaveBiasToRow_LEGACY(current, region, waveBias, enabled) {
  const clone = { ...current };
  const meta = applyWaveBias(clone, region, waveBias, enabled);
  if (!meta) return clone;
  return { ...clone, waveBias: meta };
}
*/

/**
 * Copy conditions/forecast from each source spot to its alias spots
 * (conditionsSource), deep-cloning the row so each alias is independent
 * (waveBias meta included). Returns the alias ids copied.
 * @param {Array<{ id: string, conditionsSource?: string }>} aliasSpots
 * @param {Record<string, object>} allConditions rows by spot id (mutated)
 * @param {Record<string, Array<object>>} allForecasts hourly series by spot id (mutated)
 * @returns {string[]}
 */
/*
function applyAliasSpots_LEGACY(aliasSpots, allConditions, allForecasts) {
  const copied = [];
  for (const spot of aliasSpots) {
    const srcId = spot.conditionsSource;
    if (!allConditions[srcId]) {
      console.error(`  ✗ ${spot.id}: conditionsSource "${srcId}" not found — fetch source spot first`);
      continue;
    }
    allConditions[spot.id] = JSON.parse(JSON.stringify(allConditions[srcId]));
    allForecasts[spot.id] = allForecasts[srcId];
    copied.push(spot.id);
    console.log(`  ↳ ${spot.id} ← ${srcId} (no API)`);
  }
  return copied;
}
*/

// Safety check: ensure we parsed a reasonable number of spots
const MIN_SPOTS = 50;
if (spots.length < MIN_SPOTS) {
  console.error(`\n❌ ERROR: Only ${spots.length} spots parsed from spots.ts (expected at least ${MIN_SPOTS}).`);
  console.error('   The regex parser may have failed due to a format change in spots.ts.');
  console.error('   Please check that spots.ts still contains id/lat/lon in the expected format.\n');
  process.exit(1);
}

console.log(`📋 Parsed ${spots.length} spots from src/lib/spots.ts\n`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Contador de uso real da Open-Meteo neste run (ponderado por modelo pedido).
 *
 * A métrica do orçamento é «1 chamada ponderada por modelo pedido» (ver
 * docs/CONTEXT.md — Orçamento Open-Meteo): um pedido multi-modelo com 4 modelos
 * conta 4; um best_match conta 1. `requests` conta os pedidos HTTP reais
 * (inclui retries 429) para mostrar o overhead face ao valor teórico.
 */
function createUsageCounter() {
  return {
    /** Σ (modelos × pedidos HTTP) — a métrica comparável ao orçamento 10k/dia. */
    weightedCalls: 0,
    /** Pedidos HTTP reais feitos à API (retries incluídos). */
    requests: 0,
    /** Retries (429/erro transitório) que consumiram quota extra. */
    retries: 0,
    /** Spots primários com fetch completo (aliases não chamam a API). */
    spotsFetched: 0,
    record(weight = 1) {
      this.requests += 1;
      this.weightedCalls += weight;
    },
  };
}

async function fetchWithRetry(url, retries = 3, delay = 1000, usage, weight = 1) {
  for (let i = 0; i < retries; i++) {
    try {
      // Cada pedido HTTP real conta para o uso (mesmo os que falham/retry).
      usage?.record(weight);
      const response = await fetch(url);
      if (response.ok) return response.json();
      if (response.status === 429) {
        if (usage) usage.retries += 1;
        console.log(`  ⏳ Rate limited, waiting ${delay * (i + 1)}ms...`);
        await sleep(delay * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      if (usage) usage.retries += 1;
      await sleep(delay * (i + 1));
    }
  }
  throw new Error('Max retries exceeded');
}

/*
function wavePowerKwPerM_LEGACY(heightM, periodS) {
  if (!heightM || !periodS || heightM <= 0 || periodS <= 0) return 0;
  return 0.5 * heightM * heightM * periodS;
}

const SWELL_TRAIN_MIN_HEIGHT_M = 0.1;

function wavePowerFromMarine_LEGACY({ swellHeight, swellPeriod, waveHeight, wavePeriod }) {
  if (swellHeight > SWELL_TRAIN_MIN_HEIGHT_M && swellPeriod > 0) {
    return wavePowerKwPerM(swellHeight, swellPeriod);
  }
  return wavePowerKwPerM(waveHeight || 0, wavePeriod || 0);
}

function pickSwellTrain_LEGACY(height, period, direction) {
  if (height == null || height < SWELL_TRAIN_MIN_HEIGHT_M || period == null || period <= 0) {
    return null;
  }
  return {
    height,
    period,
    direction: direction ?? 0,
  };
}

async function fetchMarineData(lat, lon, usage) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: [
      'wave_height',
      'wave_direction',
      'wave_period',
      'swell_wave_height',
      'swell_wave_direction',
      'swell_wave_period',
      'secondary_swell_wave_height',
      'secondary_swell_wave_period',
      'secondary_swell_wave_direction',
      'wind_wave_height',
      'sea_surface_temperature',
      'sea_level_height_msl',
    ].join(','),
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });

  // best_match marine = 1 chamada ponderada.
  const data = await fetchWithRetry(`${MARINE_API}?${params}`, 3, 1000, usage, 1);
  return data;
}

async function fetchWeatherData(lat, lon, usage) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });

  // best_match weather = 1 chamada ponderada.
  const data = await fetchWithRetry(`${WEATHER_API}?${params}`, 3, 1000, usage, 1);
  return data;
}

/** Multi-model wave_height only — spread/confidence (best_match stays on fetchMarineData). */
async function fetchMarineWaveModels(lat, lon, usage) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height',
    models: WAVE_MODELS.join(','),
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });
  // Multi-modelo: cada modelo pedido conta 1 ponderada.
  return fetchWithRetry(`${MARINE_API}?${params}`, 3, 1000, usage, WAVE_MODELS.length);
}

/** Multi-model wind (speed/dir/gust) — confidence spread + ICON-EU score blend. */
async function fetchWindModels(lat, lon, usage) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    models: WIND_MODELS.join(','),
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });
  // Multi-modelo: cada modelo pedido conta 1 ponderada.
  return fetchWithRetry(`${WEATHER_API}?${params}`, 3, 1000, usage, WIND_MODELS.length);
}

function getTideStatus_LEGACY(seaLevel, seaLevelNext) {
  const threshold = 0.3;
  if (seaLevel > threshold) {
    return { status: 'high', label: 'Maré Alta' };
  } else if (seaLevel < -threshold) {
    return { status: 'low', label: 'Maré Baixa' };
  } else if (seaLevelNext !== undefined && seaLevelNext > seaLevel) {
    return { status: 'rising', label: 'Maré a Subir' };
  } else {
    return { status: 'falling', label: 'Maré a Descer' };
  }
}

function getCurrentConditions(marineData, weatherData, ihTideObs) {
  const marineTimeIndex = findCurrentHourIndex(marineData.hourly.time);
  const weatherTimeIndex = Math.min(
    findCurrentHourIndex(weatherData.hourly.time),
    weatherData.hourly.wind_speed_10m.length - 1,
  );

  const seaLevel = marineData.hourly.sea_level_height_msl?.[marineTimeIndex] || 0;
  const seaLevelNext = marineData.hourly.sea_level_height_msl?.[marineTimeIndex + 1];
  const tide = getTideStatus(seaLevel, seaLevelNext);

  const waveHeight = marineData.hourly.wave_height[marineTimeIndex] || 0;
  const wavePeriod = marineData.hourly.wave_period[marineTimeIndex] || 0;
  const primaryRaw = pickSwellTrain(
    marineData.hourly.swell_wave_height?.[marineTimeIndex],
    marineData.hourly.swell_wave_period?.[marineTimeIndex],
    marineData.hourly.swell_wave_direction?.[marineTimeIndex],
  );
  const secondaryRaw = pickSwellTrain(
    marineData.hourly.secondary_swell_wave_height?.[marineTimeIndex],
    marineData.hourly.secondary_swell_wave_period?.[marineTimeIndex],
    marineData.hourly.secondary_swell_wave_direction?.[marineTimeIndex],
  );

  const swellHeight = primaryRaw?.height ?? 0;
  const swellPeriod = primaryRaw?.period ?? 0;

  const result = {
    waveHeight,
    wavePeriod,
    waveDirection: marineData.hourly.wave_direction[marineTimeIndex] || 0,
    swellHeight,
    swellPeriod,
    swellDirection: primaryRaw?.direction ?? 0,
    windWaveHeight: marineData.hourly.wind_wave_height?.[marineTimeIndex] ?? 0,
    wavePowerKw: wavePowerFromMarine({ swellHeight, swellPeriod, waveHeight, wavePeriod }),
    windSpeed: weatherData.hourly.wind_speed_10m[weatherTimeIndex] || 0,
    windDirection: weatherData.hourly.wind_direction_10m[weatherTimeIndex] || 0,
    windGust: weatherData.hourly.wind_gusts_10m[weatherTimeIndex] || 0,
    waterTemp: marineData.hourly.sea_surface_temperature[marineTimeIndex] || 0,
    tideHeight: seaLevel,
    tideStatus: tide.status,
    tideLabel: tide.label,
  };

  if (secondaryRaw) {
    result.secondarySwellHeight = secondaryRaw.height;
    result.secondarySwellPeriod = secondaryRaw.period;
    result.secondarySwellDirection = secondaryRaw.direction;
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
  console.log(
    useMultiModel
      ? '☀️ Modo dia: best_match + multi-modelo (4 pedidos/spot)'
      : '🌙 Modo noite: só best_match (2 pedidos/spot) — confiança herdada',
  );

  const outputPath = path.join(__dirname, '../public/data/conditions.json');
  let previousConditions = {};
  if (fs.existsSync(outputPath)) {
    try {
      previousConditions = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    } catch {
      console.warn('⚠️ Could not parse existing conditions.json — confidence will reset until daytime run');
    }
  }

  const allConditions = {};
  const allForecasts = {};

  // Ensemble model health — accumulate non-null counts per configured model
  // across the whole run (multimodel mode only) to spot dead models like the
  // old ecmwf_wam025 (all-null) instead of a silent `degraded` confidence.
  const modelHealthRun = {
    waveCounts: {},
    windCounts: {},
    sampledSpots: 0,
  };

  // Load IH tide station data (if available)
  let ihTides = { stations: {}, spotMapping: {} };
  const ihTidesPath = path.join(__dirname, '../public/data/ih-tides.json');
  if (fs.existsSync(ihTidesPath)) {
    try {
      ihTides = JSON.parse(fs.readFileSync(ihTidesPath, 'utf-8'));
      console.log(`📡 IH tide data loaded (${Object.keys(ihTides.stations).length} stations, ${Object.keys(ihTides.spotMapping).length} spot mappings)\n`);
    } catch (e) {
      console.warn('⚠️ Could not parse ih-tides.json, continuing without IH tide data\n');
    }
  }

  let ihSkippedStale = 0;

  // Regional wave bias (Open-Meteo vs IH buoys, wave-bias.json). Opt-in:
  // VENTU_WAVE_BIAS_CORRECTION=1 — see docs + scripts/fetch-wave-bias.js.
  const waveBiasEnabled = process.env.VENTU_WAVE_BIAS_CORRECTION === '1';
  let waveBias = null;
  const waveBiasPath = path.join(__dirname, '../public/data/wave-bias.json');
  if (fs.existsSync(waveBiasPath)) {
    try {
      waveBias = JSON.parse(fs.readFileSync(waveBiasPath, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Could not parse wave-bias.json, continuing without bias correction');
    }
  }
  if (waveBiasEnabled && waveBias) {
    console.log(`📏 Wave bias loaded (${Object.keys(waveBias.regions ?? {}).length} regions)\n`);
  }

  const aliasSpots = spots.filter((s) => s.conditionsSource);

  // Uso real da Open-Meteo neste run (ponderado por modelo) — log + meta.
  const usage = createUsageCounter();

  for (const spot of spots) {
    if (spot.conditionsSource) continue;

    try {
      console.log(`  Fetching ${spot.id}...`);

      let marineData;
      let weatherData;
      let confidenceDetail;
      let dailyConfidence;

      if (useMultiModel) {
        const [marine, weather, marineWaveModels, windModels] = await Promise.all([
          fetchMarineData(spot.lat, spot.lon, usage),
          fetchWeatherData(spot.lat, spot.lon, usage),
          fetchMarineWaveModels(spot.lat, spot.lon, usage),
          fetchWindModels(spot.lat, spot.lon, usage),
        ]);
        marineData = marine;
        weatherData = weather;
        // Model health: count non-null values per configured model (cheap —
        // reuses the multimodel responses already fetched for this spot).
        mergeCounts(modelHealthRun.waveCounts, countModelSlots(marineWaveModels.hourly, HEALTH_FAMILIES.wave.baseKey, HEALTH_FAMILIES.wave.models));
        mergeCounts(modelHealthRun.windCounts, countModelSlots(windModels.hourly, HEALTH_FAMILIES.wind.baseKey, HEALTH_FAMILIES.wind.models));
        modelHealthRun.sampledSpots += 1;
        const timeIndex = findCurrentHourIndex(marineWaveModels.hourly.time);
        confidenceDetail = confidenceAtIndex(marineWaveModels, windModels, timeIndex);
        dailyConfidence = confidenceByDay(marineWaveModels, windModels);

        // ICON-EU / multi-model blend into best_match current wind (scoring).
        const weatherIdx = Math.min(
          findCurrentHourIndex(weatherData.hourly.time),
          weatherData.hourly.wind_speed_10m.length - 1,
        );
        const windIdx = Math.min(
          findCurrentHourIndex(windModels.hourly.time),
          (windModels.hourly.time?.length ?? 1) - 1,
        );
        const blend = blendWindAtIndex(
          weatherData.hourly.wind_speed_10m[weatherIdx] || 0,
          weatherData.hourly.wind_direction_10m[weatherIdx] || 0,
          weatherData.hourly.wind_gusts_10m[weatherIdx] || 0,
          readModelMap(windModels.hourly, 'wind_speed_10m', WIND_MODELS, windIdx),
          readModelMap(windModels.hourly, 'wind_direction_10m', WIND_MODELS, windIdx),
          readModelMap(windModels.hourly, 'wind_gusts_10m', WIND_MODELS, windIdx),
        );
        weatherData = {
          ...weatherData,
          hourly: {
            ...weatherData.hourly,
            wind_speed_10m: weatherData.hourly.wind_speed_10m.map((v, i) =>
              i === weatherIdx ? blend.windSpeed : v,
            ),
            wind_direction_10m: weatherData.hourly.wind_direction_10m.map((v, i) =>
              i === weatherIdx ? blend.windDirection : v,
            ),
            wind_gusts_10m: weatherData.hourly.wind_gusts_10m.map((v, i) =>
              i === weatherIdx ? blend.windGust : v,
            ),
          },
          _windBlend: {
            method: blend.method,
            blended: blend.blended,
            modelCount: blend.modelCount,
            iconEuMs: blend.iconEuMs,
            medianMs: blend.medianMs,
          },
          _windModelsHourly: windModels.hourly,
        };
      } else {
        [marineData, weatherData] = await Promise.all([
          fetchMarineData(spot.lat, spot.lon, usage),
          fetchWeatherData(spot.lat, spot.lon, usage),
        ]);
        const inherited = confidenceFromPrevious(previousConditions[spot.id]);
        confidenceDetail = {
          confidence: inherited.confidence,
          ...inherited.confidenceDetail,
        };
        dailyConfidence = inherited.dailyConfidence;
      }
      
      // Check if we have IH tide data for this spot
      const spotMapping = ihTides.spotMapping[spot.id];
      let ihTideObs = null;
      if (spotMapping) {
        const station = ihTides.stations[spotMapping.codp];
        if (station && isFreshIhObservation(station.lastData)) {
          ihTideObs = {
            lastObs: station.lastObs,
            lastData: station.lastData,
            stationTitle: station.title,
          };
        } else if (station) {
          ihSkippedStale += 1;
        }
      }

      const current = getCurrentConditions(marineData, weatherData, ihTideObs);

      // Regional bias correction (opt-in): corrects waveHeight from the buoy
      // bias, keeps the raw value + metadata for the UI to stay honest.
      const biasRow = applyWaveBiasToRow(current, spot.region, waveBias, waveBiasEnabled);
      if (biasRow.waveBias) {
        console.log(
          `  ↳ ${spot.id}: waveHeight ${biasRow.waveHeightRaw} → ${biasRow.waveHeight} m (bias ${biasRow.waveBias.me >= 0 ? '+' : ''}${biasRow.waveBias.me} m, n=${biasRow.waveBias.n})`,
        );
      }

      allConditions[spot.id] = {
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
        ...(weatherData._windBlend
          ? {
              windBlend: {
                method: weatherData._windBlend.method,
                blended: weatherData._windBlend.blended,
                modelCount: weatherData._windBlend.modelCount,
              },
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };

      // Store full hourly forecast for spot detail page
      const mergedForecast = [];
      const maxHours = Math.min(marineData.hourly.time.length, weatherData.hourly.time.length, 168);
      for (let i = 0; i < maxHours; i++) {
        const fh = marineData.hourly.wave_height[i] || 0;
        const ft = marineData.hourly.wave_period[i] || 0;
        const fSwellH = marineData.hourly.swell_wave_height?.[i] ?? 0;
        const fSwellT = marineData.hourly.swell_wave_period?.[i] ?? 0;
        mergedForecast.push({
          time: marineData.hourly.time[i],
          waveHeight: fh,
          wavePeriod: ft,
          waveDirection: marineData.hourly.wave_direction[i] || 0,
          swellHeight: fSwellH,
          swellPeriod: fSwellT,
          swellDirection: marineData.hourly.swell_wave_direction?.[i] ?? 0,
          windWaveHeight: marineData.hourly.wind_wave_height?.[i] ?? 0,
          wavePowerKw: wavePowerFromMarine({
            swellHeight: fSwellH,
            swellPeriod: fSwellT,
            waveHeight: fh,
            wavePeriod: ft,
          }),
          windSpeed: weatherData.hourly.wind_speed_10m[i] || 0,
          windDirection: weatherData.hourly.wind_direction_10m[i] || 0,
          windGust: weatherData.hourly.wind_gusts_10m[i] || 0,
          waterTemp: marineData.hourly.sea_surface_temperature[i] || 0,
          tideHeight: marineData.hourly.sea_level_height_msl[i] || 0,
        });
      }
      if (weatherData._windModelsHourly) {
        applyWindBlendToHours(mergedForecast, weatherData._windModelsHourly, WIND_MODELS);
      }
      allForecasts[spot.id] = mergedForecast;
      
      console.log(`  ✓ ${spot.id} updated${ihTideObs ? ` (IH tide: ${ihTideObs.lastObs}m)` : ''}`);

      // Só conta spots primários com fetch completo (aliases não chamam a API).
      usage.spotsFetched += 1;
      
      // 4 calls/spot; ~300/min with 200ms gap (under Open-Meteo 600/min)
      await sleep(MIN_REQUEST_INTERVAL);
    } catch (error) {
      console.error(`  ✗ ${spot.id} failed:`, error.message);
    }
  }

  applyAliasSpots(aliasSpots, allConditions, allForecasts);

  if (ihSkippedStale > 0) {
    console.warn(
      `⚠️ Skipped stale IH observed tide on ${ihSkippedStale} spots (lastData > ${MAX_OBS_AGE_HOURS}h) — forecast tides stay on Open-Meteo`,
    );
  }

  const biasApplied = Object.values(allConditions).filter((c) => c.waveBias).length;
  if (waveBiasEnabled && biasApplied > 0) {
    console.log(`📏 Bias correction applied on ${biasApplied} spots (n≥${MIN_BIAS_N}, |ME|≥${MIN_BIAS_M} m)`);
  }

  function atomicWriteJson(filePath, content) {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(content), 'utf-8');
    const backupPath = filePath + '.backup';
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }
    fs.renameSync(tmpPath, filePath);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  
  // Validate we have data before writing
  const spotCount = Object.keys(allConditions).length;
  const primaryIds = spots.filter((s) => !s.conditionsSource).map((s) => s.id);
  const failedPrimary = primaryIds.filter((id) => !allConditions[id]);
  if (failedPrimary.length > 0) {
    console.warn(`⚠️ ${failedPrimary.length} primary spots failed: ${failedPrimary.slice(0, 8).join(', ')}${failedPrimary.length > 8 ? '…' : ''}`);
  }
  const minOk = Math.ceil(primaryIds.length * 0.95);
  const okPrimary = primaryIds.length - failedPrimary.length;
  if (okPrimary < minOk) {
    console.error(`\n❌ ERROR: Only ${okPrimary}/${primaryIds.length} primary spots fetched (need ≥${minOk}). Not writing.`);
    process.exit(1);
  }
  if (spotCount === 0) {
    console.error('\n❌ ERROR: No conditions fetched! Not writing empty file.');
    process.exit(1);
  }
  
  atomicWriteJson(outputPath, allConditions);

  // Write hourly forecasts for spot detail pages
  const forecastsPath = path.join(__dirname, '../public/data/forecasts.json');
  atomicWriteJson(forecastsPath, allForecasts);

  // Write per-spot forecast files (~50KB each, vs 8MB full file)
  const perSpotDir = path.join(__dirname, '../public/data/forecasts');
  fs.mkdirSync(perSpotDir, { recursive: true });
  let perSpotCount = 0;
  for (const [dataId, forecast] of Object.entries(allForecasts)) {
    try {
      const spotPath = path.join(perSpotDir, `${dataId}.json`);
      atomicWriteJson(spotPath, forecast);
      perSpotCount++;
    } catch (err) {
      console.error(`  ⚠️ Failed to write per-spot forecast for ${dataId}:`, err.message);
    }
  }

  console.log(`\n✅ Conditions saved to ${outputPath}`);
  console.log(`📈 Forecasts saved to ${forecastsPath}`);
  console.log(`📊 Per-spot forecasts: ${perSpotCount} files in ${perSpotDir}`);
  console.log(`📊 Updated ${spotCount} spots`);

  // ── Ensemble model health (multimodel mode only) ──────────────────────────
  if (useMultiModel) {
    const healthReport = buildHealthReport(modelHealthRun);
    if (healthReport.dead.length > 0) {
      const deadList = healthReport.dead
        .map((d) => `${d.model} (${d.family})`)
        .join(', ');
      console.error(`\n🚨 MODELOS MORTOS (só null): ${deadList}`);
      console.error(`   Amostrados ${modelHealthRun.sampledSpots} spots — os modelos morrem em silêncio e degradam a confiança.`);
      console.error('   Report: public/data/model-health.json · remove o modelo de forecastConfidence.js ou contacta a Open-Meteo.\n');
    } else {
      console.log(`💚 Modelos do ensemble OK (${modelHealthRun.sampledSpots} spots amostrados)`);
    }
    // Notifica ANTES de gravar: a transição compara com o report do run
    // anterior em disco; depois persistimos o estado actual.
    await notifyDeadModels(healthReport);
    writeModelHealth(healthReport);
  } else {
    console.log('ℹ️ Modo noite: sem dados multi-modelo — health-check de modelos não aplicável.');
  }

  // ── Uso real da Open-Meteo ────────────────────────────────────────────────
  const weightedPerSpot = useMultiModel
    ? 2 + WAVE_MODELS.length + WIND_MODELS.length
    : 2; // best_match marine + weather
  const dailyBudgetPct = ((usage.weightedCalls / 10_000) * 100).toFixed(1);
  console.log(
    `\n📊 Open-Meteo usage (real): ${usage.weightedCalls} chamadas ponderadas ` +
      `(${usage.requests} pedidos HTTP, ${usage.retries} retries) · ` +
      `${usage.spotsFetched} spots · ${weightedPerSpot} ponderadas/spot · ` +
      `${dailyBudgetPct}% do orçamento diário (10k)`,
  );

  const metaRoot = path.join(__dirname, '..');
  const prevMeta = readPipelineMeta(metaRoot);
  const buoyLayer = applyBuoyLayerStreak(loadBuoyLayerStatus(metaRoot), prevMeta);
  const radarLayer = applyLayerStreak(loadRadarLayerStatus(metaRoot), prevMeta, 'radarLayer');
  const warningsLayer = applyLayerStreak(
    loadWarningsLayerStatus(metaRoot),
    prevMeta,
    'warningsLayer',
  );
  const coastalWarningsLayer = buildCoastalWarningsLayer(metaRoot, prevMeta);
  writePipelineMeta('full', new Date(), metaRoot, {
    buoyLayer,
    radarLayer,
    warningsLayer,
    coastalWarningsLayer,
    openMeteoUsage: {
      weightedCalls: usage.weightedCalls,
      requests: usage.requests,
      retries: usage.retries,
      spotsFetched: usage.spotsFetched,
      mode: useMultiModel ? 'day' : 'night',
      weightedPerSpot,
      waveModels: WAVE_MODELS.length,
      windModels: WIND_MODELS.length,
    },
  });
  if (buoyLayer) {
    console.log(
      `🌊 Camada de boias: ${buoyLayer.status} (key ${buoyLayer.apiKeyConfigured ? '✓' : '✗'}, ` +
        `wave data ${buoyLayer.hasWaveData ? '✓' : '✗'}${buoyLayer.newestReadingAt ? `, última leitura ${buoyLayer.newestReadingAt}` : ''}` +
        `${buoyLayer.streak > 0 ? `, streak down/stale: ${buoyLayer.streak} runs` : ''})`,
    );
  } else {
    console.log('🌊 Camada de boias: sem ih-buoys.json (primeiro run)');
  }
  if (radarLayer) {
    console.log(
      `📡 Camada de radar: ${radarLayer.status}${radarLayer.frameTime ? ` · frame ${radarLayer.frameTime}` : ''}` +
        `${radarLayer.streak > 0 ? `, streak down/stale: ${radarLayer.streak} runs` : ''}`,
    );
  } else {
    console.log('📡 Camada de radar: sem radar.json (primeiro run)');
  }
  if (warningsLayer) {
    console.log(
      `⚠️  Camada de avisos: ${warningsLayer.status} · ${warningsLayer.activeWarnings ?? 0} avisos activos` +
        ` (${warningsLayer.source ?? '?'}${warningsLayer.fetchedAt ? `, ${warningsLayer.fetchedAt}` : ''})` +
        `${warningsLayer.streak > 0 ? `, streak down/stale: ${warningsLayer.streak} runs` : ''}`,
    );
  } else {
    console.log('⚠️  Camada de avisos: sem warnings.json (primeiro run)');
  }
  if (coastalWarningsLayer) {
    console.log(
      `⚓ Camada de avisos costeiros: ${coastalWarningsLayer.status} · ${coastalWarningsLayer.activeWarnings ?? 0} avisos em vigor, ` +
        `${coastalWarningsLayer.coveredSpots ?? 0} spots cobertos` +
        `${coastalWarningsLayer.fetchedAt ? ` · fetch ${coastalWarningsLayer.fetchedAt}` : ''}` +
        `${coastalWarningsLayer.streak > 0 ? `, streak down/stale: ${coastalWarningsLayer.streak} runs` : ''}`,
    );
  } else {
    console.log('⚓ Camada de avisos costeiros: sem ih-coastal-warnings.json (primeiro run)');
  }
}

if (require.main === module) {
  updateConditions().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  parseSpotsFromFile,
  applyWaveBiasToRow,
  applyAliasSpots,
  resolveUseMultiModel,
  confidenceFromPrevious,
  createUsageCounter,
  fetchWithRetry,
  spots,
  MIN_SPOTS,
};
