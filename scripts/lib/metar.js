/**
 * METAR observations (aviationweather.gov) — free airport wind for Portugal.
 * Used as fallback when IPMA/Ecowitt are missing or farther; airports ≠ beach thermal.
 * @see https://aviationweather.gov/data/api/
 */

const { haversineKm, MAX_STATION_DISTANCE_KM, MAX_OBS_AGE_MS } = require('./ipma.js');

const METAR_API =
  'https://aviationweather.gov/api/data/metar?format=json&hours=2&ids=';

/**
 * Mainland METAR stays at 30 km (same as IPMA).
 * Madeira / Açores: slightly wider so west-coast Madeira (e.g. Seixal) can use LPMA.
 */
const MAX_METAR_DISTANCE_KM_MAINLAND = MAX_STATION_DISTANCE_KM;
const MAX_METAR_DISTANCE_KM_ISLANDS = 35;

function isIslandCoords(lat, lon) {
  const madeira = lat > 32 && lat < 34 && lon > -18 && lon < -15;
  const azores = lat > 36 && lat < 40 && lon > -32 && lon < -24;
  return madeira || azores;
}

/** Max METAR radius for a spot (km). */
function metarMaxDistanceKm(lat, lon) {
  return isIslandCoords(lat, lon)
    ? MAX_METAR_DISTANCE_KM_ISLANDS
    : MAX_METAR_DISTANCE_KM_MAINLAND;
}

/** Coastal / island ICAO useful for VenTu spots (lat/lon from AWC when known). */
const PT_METAR_STATIONS = [
  { icao: 'LPPT', name: 'Lisboa (METAR)', lat: 38.781, lon: -9.136 },
  { icao: 'LPCS', name: 'Cascais (METAR)', lat: 38.725, lon: -9.355 },
  { icao: 'LPMT', name: 'Montijo (METAR)', lat: 38.704, lon: -9.036 },
  { icao: 'LPPR', name: 'Porto (METAR)', lat: 41.235, lon: -8.684 },
  { icao: 'LPOV', name: 'Ovar (METAR)', lat: 40.916, lon: -8.646 },
  { icao: 'LPFR', name: 'Faro (METAR)', lat: 37.014, lon: -7.966 },
  { icao: 'LPMA', name: 'Madeira (METAR)', lat: 32.698, lon: -16.774 },
  { icao: 'LPPS', name: 'Porto Santo (METAR)', lat: 33.073, lon: -16.35 },
  { icao: 'LPPD', name: 'Ponta Delgada (METAR)', lat: 37.741, lon: -25.698 },
  { icao: 'LPLA', name: 'Lajes (METAR)', lat: 38.762, lon: -27.091 },
  { icao: 'LPHR', name: 'Horta (METAR)', lat: 38.52, lon: -28.716 },
  { icao: 'LPFL', name: 'Flores (METAR)', lat: 39.455, lon: -31.131 },
  { icao: 'LPGR', name: 'Graciosa (METAR)', lat: 39.092, lon: -28.03 },
  { icao: 'LPSJ', name: 'São Jorge (METAR)', lat: 38.666, lon: -28.176 },
  { icao: 'LPPI', name: 'Pico (METAR)', lat: 38.554, lon: -28.441 },
  { icao: 'LPAZ', name: 'Santa Maria (METAR)', lat: 36.971, lon: -25.171 },
];

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function cardinalFromDeg(deg) {
  if (deg == null || !Number.isFinite(deg)) return '—';
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return CARDINALS[i];
}

function metarIcaoList() {
  return PT_METAR_STATIONS.map((s) => s.icao).join(',');
}

/**
 * Fetch latest METAR JSON keyed by ICAO (freshest report per airport).
 * @returns {Promise<Record<string, object>>}
 */
async function fetchMetarByIcao() {
  const url = `${METAR_API}${encodeURIComponent(metarIcaoList())}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'VenTu/1.0 (ventu.surf)' },
  });
  if (!res.ok) throw new Error(`METAR HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('METAR: unexpected payload');

  /** @type {Record<string, object>} */
  const byIcao = {};
  for (const row of rows) {
    const icao = row?.icaoId;
    if (!icao || typeof icao !== 'string') continue;
    const prev = byIcao[icao];
    const t = Number(row.obsTime) || 0;
    const prevT = prev ? Number(prev.obsTime) || 0 : 0;
    if (!prev || t >= prevT) byIcao[icao] = row;
  }
  return byIcao;
}

/**
 * Nearest airports within maxKm, sorted closest-first.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [maxKm]
 */
function nearestMetarStations(lat, lon, maxKm) {
  const limit =
    maxKm != null && Number.isFinite(maxKm) ? maxKm : metarMaxDistanceKm(lat, lon);
  return PT_METAR_STATIONS.map((s) => ({
    ...s,
    distanceKm: Math.round(haversineKm(lat, lon, s.lat, s.lon) * 10) / 10,
  }))
    .filter((s) => s.distanceKm <= limit)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Build ObservedConditions-shaped payload from a METAR row.
 * @param {object} row
 * @param {{ name: string; distanceKm: number; icao: string }} station
 * @param {number} [maxKm]
 */
function buildMetarObservedPayload(row, station, maxKm = MAX_METAR_DISTANCE_KM_MAINLAND) {
  const wspd = Number(row.wspd);
  if (!Number.isFinite(wspd) || wspd < 0) return null;

  const obsSec = Number(row.obsTime);
  if (!Number.isFinite(obsSec)) return null;
  const observedAt = new Date(obsSec * 1000).toISOString();
  if (Date.now() - obsSec * 1000 > MAX_OBS_AGE_MS) return null;

  if (station.distanceKm > maxKm) return null;

  const wdir = Number(row.wdir);
  const hasDir = Number.isFinite(wdir) && wdir >= 0 && wdir <= 360;
  const tempC = Number(row.temp);

  return {
    windSpeedKt: Math.round(wspd),
    windDirDeg: hasDir ? wdir : 0,
    windDirMissing: !hasDir,
    windCardinal: hasDir ? cardinalFromDeg(wdir) : '—',
    windCardinalEn: hasDir ? cardinalFromDeg(wdir) : '—',
    tempC: Number.isFinite(tempC) ? tempC : undefined,
    stationName: station.name,
    distanceKm: station.distanceKm,
    observedAt,
    source: 'metar',
    metarIcao: station.icao,
  };
}

/**
 * Best METAR candidate for a spot (nearest airport with fresh wind).
 * @param {{ lat: number; lon: number }} spot
 * @param {Record<string, object> | null} metarByIcao
 */
function buildMetarObservedForSpot(spot, metarByIcao) {
  if (!metarByIcao) return null;
  const maxKm = metarMaxDistanceKm(spot.lat, spot.lon);
  for (const st of nearestMetarStations(spot.lat, spot.lon, maxKm)) {
    const row = metarByIcao[st.icao];
    if (!row) continue;
    const payload = buildMetarObservedPayload(row, st, maxKm);
    if (payload) return payload;
  }
  return null;
}

module.exports = {
  PT_METAR_STATIONS,
  MAX_METAR_DISTANCE_KM_MAINLAND,
  MAX_METAR_DISTANCE_KM_ISLANDS,
  isIslandCoords,
  metarMaxDistanceKm,
  fetchMetarByIcao,
  nearestMetarStations,
  buildMetarObservedPayload,
  buildMetarObservedForSpot,
  cardinalFromDeg,
};
