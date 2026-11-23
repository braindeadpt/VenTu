'use strict';
/**
 * Pre-fetch multi-coordenada do Open-Meteo (Fase 3, P2.1).
 *
 * Em vez de 2–4 pedidos HTTP por spot (marine + weather [+ wave/wind models]),
 * agrupa os spots primários por fuso (`spotTimeZone` — a janela
 * `start_hour`/`end_hour` depende do fuso) e pede ≤ BATCH_SIZE coordenadas por
 * pedido (`latitude=a,b,c&longitude=x,y,z` → resposta em array, mesma ordem).
 *
 * Resultado: Map<coordKey> com os 4 payloads já localizados por spot; os
 * fetchers leem do mapa e caem no pedido individual quando uma entrada falta
 * (lote falhado, resposta curta, coordenada fora da tolerância) — o
 * retryFailedSpots continua a funcionar como fallback transparente.
 */
const { spotTimeZone, localizeHourly } = require('./openMeteoUtc');
const {
  buildMarineParams,
  buildWeatherParams,
  buildMarineModelsParams,
  buildWindModelsParams,
} = require('./updateConditionsFetch');

/** Spots por pedido multi-coordenada — URL ~1 KB, resposta ~1 MB, bem dentro dos limites. */
const BATCH_SIZE = 40;
/** Tolerância de verificação: a resposta vem snapada para a grelha do modelo (~0.1°). */
const COORD_TOLERANCE_DEG = 0.15;

const coordKey = (lat, lon) => `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;

/**
 * Agrupa `spots` por fuso de parede (a janela UTC pedida depende dele) e
 * divide cada grupo em lotes de ≤ `size`.
 * @returns {Array<{ tz: string, spots: object[] }>}
 */
function chunkSpotsByTz(spots, size = BATCH_SIZE) {
  const byTz = new Map();
  for (const spot of spots) {
    const tz = spotTimeZone(spot);
    if (!byTz.has(tz)) byTz.set(tz, []);
    byTz.get(tz).push(spot);
  }
  const chunks = [];
  for (const [tz, arr] of byTz) {
    for (let i = 0; i < arr.length; i += size) chunks.push({ tz, spots: arr.slice(i, i + size) });
  }
  return chunks;
}

/** latitude/longitude de um lote em CSV, com os parâmetros de tempo do fuso do lote. */
function batchParams(builder, chunk, opts) {
  const lats = chunk.spots.map((s) => s.lat);
  const lons = chunk.spots.map((s) => s.lon);
  return builder(lats, lons, { ...opts, tz: chunk.tz });
}

/**
 * Verifica que a resposta do elemento `i` corresponde ao spot pedido
 * (a API devolve a grelha do modelo — tolerância ~0.15°).
 */
function matchesSpot(json, spot) {
  if (!json || typeof json !== 'object' || json.error) return false;
  if (typeof json.latitude === 'number' && Math.abs(json.latitude - spot.lat) > COORD_TOLERANCE_DEG) return false;
  if (typeof json.longitude === 'number' && Math.abs(json.longitude - spot.lon) > COORD_TOLERANCE_DEG) return false;
  return Boolean(json.hourly);
}

/**
 * Executa o prefetch: para cada lote (fuso × ≤BATCH_SIZE) dispara os 4
 * endpoints em paralelo e mapeia resposta[i] → spot[i] com verificação de
 * coordenada. Um lote inteiro falhado deixa os seus spots fora do mapa —
 * os fetchers com fallback tratam deles individualmente.
 *
 * @param {object} o
 * @param {object[]} o.spots spots primários (sem `conditionsSource`)
 * @param {boolean} o.useMultiModel
 * @param {object} o.usage contador (record(weight)) — o peso escala com o nº de coordenadas
 * @param {Function} o.fetchWithRetry
 * @param {string} o.marineApi
 * @param {string} o.weatherApi
 * @param {number} [o.waveModelsWeight] modelos de onda (peso quota por coordenada)
 * @param {number} [o.windModelsWeight]
 * @param {number} [o.batchSize]
 * @param {Function} [o.sleepMs]
 * @param {number} [o.interBatchMs]
 * @returns {Promise<{ byCoord: Map<string, {marine?: object, weather?: object, waveModels?: object, windModels?: object}>, batches: number, spots: number }>}
 */
async function prefetchOpenMeteo(o) {
  const size = o.batchSize ?? BATCH_SIZE;
  const chunks = chunkSpotsByTz(o.spots, size);
  const byCoord = new Map();
  const marineWeight = 1;
  const weatherWeight = 1;
  const waveWeight = o.waveModelsWeight ?? 1;
  const windWeight = o.windModelsWeight ?? 1;

  for (const chunk of chunks) {
    const n = chunk.spots.length;
    const jobs = [
      o
        .fetchWithRetry(`${o.marineApi}?${batchParams(buildMarineParams, chunk)}`, 3, 1000, o.usage, marineWeight * n)
        .catch(() => null),
      o
        .fetchWithRetry(`${o.weatherApi}?${batchParams(buildWeatherParams, chunk)}`, 3, 1000, o.usage, weatherWeight * n)
        .catch(() => null),
    ];
    if (o.useMultiModel) {
      jobs.push(
        o
          .fetchWithRetry(`${o.marineApi}?${batchParams(buildMarineModelsParams, chunk)}`, 3, 1000, o.usage, waveWeight * n)
          .catch(() => null),
        o
          .fetchWithRetry(`${o.weatherApi}?${batchParams(buildWindModelsParams, chunk)}`, 3, 1000, o.usage, windWeight * n)
          .catch(() => null),
      );
    }
    const [marines, weathers, waveModelsArr, windModelsArr] = await Promise.all(jobs);

    chunk.spots.forEach((spot, i) => {
      const tz = spotTimeZone(spot);
      const entry = {};
      const marine = Array.isArray(marines) ? marines[i] : null;
      const weather = Array.isArray(weathers) ? weathers[i] : null;
      const waveModels = Array.isArray(waveModelsArr) ? waveModelsArr[i] : null;
      const windModels = Array.isArray(windModelsArr) ? windModelsArr[i] : null;
      if (matchesSpot(marine, spot)) entry.marine = localizeHourly(marine, tz);
      if (matchesSpot(weather, spot)) entry.weather = localizeHourly(weather, tz);
      if (matchesSpot(waveModels, spot)) entry.waveModels = localizeHourly(waveModels, tz);
      if (matchesSpot(windModels, spot)) entry.windModels = localizeHourly(windModels, tz);
      if (Object.keys(entry).length) byCoord.set(coordKey(spot.lat, spot.lon), entry);
    });

    if (o.sleepMs && o.interBatchMs && chunks.indexOf(chunk) < chunks.length - 1) {
      await o.sleepMs(o.interBatchMs);
    }
  }

  return { byCoord, batches: chunks.length, spots: o.spots.length };
}

/**
 * Envolve os fetchers individuais: lê primeiro do `byCoord` do prefetch e só
 * faz o pedido real quando a entrada falta (lote falhado / coordenada fora).
 */
function createPrefetchedFetchers({ byCoord, fetchers }) {
  const wrap = (kind, name) => (lat, lon, usage) => {
    const hit = byCoord.get(coordKey(lat, lon));
    if (hit?.[kind]) return Promise.resolve(hit[kind]);
    return fetchers[name](lat, lon, usage);
  };
  return {
    fetchMarineData: wrap('marine', 'fetchMarineData'),
    fetchWeatherData: wrap('weather', 'fetchWeatherData'),
    fetchMarineWaveModels: wrap('waveModels', 'fetchMarineWaveModels'),
    fetchWindModels: wrap('windModels', 'fetchWindModels'),
  };
}

module.exports = { BATCH_SIZE, COORD_TOLERANCE_DEG, coordKey, chunkSpotsByTz, prefetchOpenMeteo, createPrefetchedFetchers };
