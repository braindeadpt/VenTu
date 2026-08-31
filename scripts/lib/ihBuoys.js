/**
 * IH Datawell Waverider buoys — measured wave data (ground truth for surf).
 *
 * Same IH host family as the tide gauges, but a DIFFERENT backend: the buoy
 * collections keep serving while the tide observations backend 500s
 * (incident 2026-08-13). This gives the observed layer a second independent
 * IH source for wave height/period/direction, not just wind.
 *
 * - Stations list: OGC API Features (free, no key) — Datawell Waverider
 *   (`buoys_datawell`) plus Fugro Oceanor Wavescan (`buoys_Fugro_oceanor_wavescan`,
 *   includes the active Nazaré Costeira buoy that has no Datawell equivalent).
 * - Wave time series: IH REST `getDatawellData` (free API key, X-API-KEY),
 *   keyed by id_est regardless of instrument family.
 *
 * Buoys are deep-water; swell height/period is coherent over long distances,
 * so the mapping radius is far larger than the wind-station radius (30 km).
 * The attach radius is still conservative and distanceKm is always reported
 * so the UI can stay honest ("boia Sines a 175 km").
 *
 * @see https://faq.hidrografico.pt/books/hidrografico/page/servico-de-dados-boias-datawell-waverider
 */

const DEFAULT_IH_API = 'https://api-features.hidrografico.pt';
const DEFAULT_WAVE_API = 'https://supportserver1.hidrografico.pt/geodata/buoys';
const DEFAULT_COLLECTIONS = ['buoys_datawell', 'buoys_Fugro_oceanor_wavescan'];

/** Nearest-buoy mapping radius (km). Generous: only ~3 mainland buoys. */
const MAX_BUOY_MAP_KM = 250;
/** Max distance to ATTACH a buoy reading to a spot (km). */
const MAX_BUOY_ATTACH_KM = 200;
/** Buoy readings older than this are not attached (matches wind obs 3h). */
const MAX_OBS_AGE_HOURS = 3;
/** Time window (h) requested from getDatawellData — latest rows only. */
const WAVE_WINDOW_HOURS = 24;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalise an OGC Feature into our internal station shape.
 * Accepts the OGC API schema (name/nrt) and the older WFS schema (nome/nrtd).
 * @param {object} feature GeoJSON feature from /collections/buoys_datawell/items
 * @param {string} [collection] source collection (buoys_datawell | buoys_Fugro_...)
 * @returns {object | null}
 */
function normalizeStation(feature, collection) {
  const p = feature?.properties ?? {};
  const idEst = Number(p.id_est);
  if (!Number.isFinite(idEst)) return null;
  const [lon, lat] = feature?.geometry?.coordinates ?? [NaN, NaN];
  const numLat = Number.isFinite(Number(p.lat)) ? Number(p.lat) : Number(lat);
  const numLon = Number.isFinite(Number(p.lon)) ? Number(p.lon) : Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return null;
  return {
    idEst,
    name: String(p.name ?? p.nome ?? `Boia ${idEst}`),
    area: p.area != null ? String(p.area) : undefined,
    wmoId: p.wmo_id != null ? Number(p.wmo_id) : undefined,
    depth: p.depth != null ? Number(p.depth) : undefined,
    status: p.status != null ? String(p.status) : undefined,
    nrt: String(p.nrt ?? p.nrtd ?? ''),
    lat: numLat,
    lon: numLon,
    // Fugro Wavescan features use `last_data` instead of `last_sea`.
    lastPos: p.last_pos != null ? String(p.last_pos) : undefined,
    lastSea: p.last_sea != null ? String(p.last_sea) : p.last_data != null ? String(p.last_data) : undefined,
    // Instrument family for diagnostics/About: 'datawell' | 'fugro'.
    family: String(collection ?? '').toLowerCase().includes('fugro') ? 'fugro' : 'datawell',
  };
}

/**
 * Fetch the buoy station list from the IH OGC API (no key required).
 * @param {string} [apiBase]
 * @param {string[]} [collections]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ stations: Record<string, object>, sourceCollections: string[] }>}
 */
async function fetchBuoyStations(
  apiBase = DEFAULT_IH_API,
  collections = DEFAULT_COLLECTIONS,
  fetchImpl = fetch,
) {
  const stations = {};
  const sourceCollections = [];
  const errors = [];

  for (const col of collections) {
    const url = `${apiBase}/collections/${encodeURIComponent(col)}/items?limit=200&f=json`;
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/geo+json, application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const features = data?.features;
      if (!Array.isArray(features)) throw new Error('no features array');
      for (const f of features) {
        const st = normalizeStation(f, col);
        if (st) stations[st.idEst] = st;
      }
      sourceCollections.push(col);
    } catch (err) {
      errors.push(`${col}: ${err.message}`);
    }
  }

  if (Object.keys(stations).length === 0) {
    throw new Error(`All IH buoy collections failed — ${errors.join('; ')}`);
  }

  return { stations, sourceCollections };
}

/**
 * Extract rows from a getDatawellData response, whatever the wrapper.
 * The FAQ documents a row-shaped payload; be tolerant of array / data / features.
 * @param {unknown} json
 * @returns {Array<Record<string, unknown>>}
 */
function extractWaveRows(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const key of ['data', 'values', 'results', 'features']) {
      const v = json[key];
      if (Array.isArray(v)) {
        // Features carry properties payloads; rows carry raw key-values.
        return v.map((x) => (x && typeof x === 'object' && x.properties ? x.properties : x));
      }
    }
  }
  return [];
}

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise one wave row. Uses the documented IH field names:
 * date, hm0 (Hs m), tp (peak period s), thtp (peak direction °), hmax, temp.
 * @param {Record<string, unknown>} row
 * @returns {{ date: string, hm0: number, tp?: number, thtp?: number, hmax?: number, temp?: number } | null}
 */
function parseWaveRow(row) {
  if (!row || typeof row !== 'object') return null;
  const hm0 = finiteNumber(row.hm0);
  if (hm0 == null || hm0 < 0) return null;
  const date = row.date != null ? String(row.date) : '';
  const parsed = new Date(date).getTime();
  if (!Number.isFinite(parsed)) return null;

  const out = { date: new Date(parsed).toISOString(), hm0 };
  const tp = finiteNumber(row.tp);
  const thtp = finiteNumber(row.thtp);
  const hmax = finiteNumber(row.hmax);
  const temp = finiteNumber(row.temp);
  if (tp != null && tp >= 0) out.tp = tp;
  if (thtp != null && thtp >= 0 && thtp <= 360) out.thtp = thtp;
  if (hmax != null && hmax >= 0) out.hmax = hmax;
  if (temp != null) out.temp = temp;
  return out;
}

/**
 * Latest valid wave row from a getDatawellData response.
 * @param {unknown} json
 * @returns {{ date: string, hm0: number, tp?: number, thtp?: number, hmax?: number, temp?: number } | null}
 */
function pickLatestWave(json) {
  let best = null;
  for (const row of extractWaveRows(json)) {
    const parsed = parseWaveRow(row);
    if (!parsed) continue;
    if (!best || parsed.date > best.date) best = parsed;
  }
  return best;
}

/**
 * UTC window for getDatawellData (latest rows only).
 * @param {number} [hoursBack]
 * @param {number} [nowMs]
 * @returns {{ startDate: string, endDate: string }}
 */
function waveWindow(hoursBack = WAVE_WINDOW_HOURS, nowMs = Date.now()) {
  const end = new Date(nowMs);
  const start = new Date(nowMs - hoursBack * 3_600_000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/**
 * Build the getDatawellData request URL for one buoy (the key travels in the
 * X-API-KEY header, never in the query string — so this URL is safe to print
 * and to share with the user for a raw curl with their own key).
 * @param {number} stationId
 * @param {{ startDate: string, endDate: string }} [window]
 * @param {string} [waveBase]
 * @returns {string}
 */
function buildWaveRequestUrl(stationId, window, waveBase = DEFAULT_WAVE_API) {
  return `${waveBase}/getDatawellData?${new URLSearchParams({
    startDate: window.startDate,
    endDate: window.endDate,
    stationId: String(stationId),
  })}`;
}

/**
 * Fetch the latest wave snapshot for one buoy (requires X-API-KEY).
 * @param {string} apiKey
 * @param {number} stationId
 * @param {string} [waveBase]
 * @param {typeof fetch} [fetchImpl]
 * @param {{ startDate: string, endDate: string }} [window]
 * @returns {Promise<object | null>}
 */
async function fetchBuoyWave(
  apiKey,
  stationId,
  waveBase = DEFAULT_WAVE_API,
  fetchImpl = fetch,
  window = waveWindow(),
) {
  if (!apiKey) return null;
  const url = buildWaveRequestUrl(stationId, window, waveBase);
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for buoy ${stationId}`);
  const json = await res.json();
  return pickLatestWave(json);
}

/**
 * Fetch the FULL wave series for one buoy within [window] (requires X-API-KEY).
 * Same endpoint as fetchBuoyWave but returns ALL parsed rows (newest last),
 * used by the skill/bias layer (Open-Meteo vs IH).
 * @param {string} apiKey
 * @param {number} stationId
 * @param {string} [waveBase]
 * @param {typeof fetch} [fetchImpl]
 * @param {{ startDate: string, endDate: string }} [window]
 * @returns {Promise<Array<{ date: string, hm0: number, tp?: number, thtp?: number, hmax?: number, temp?: number }>>}
 */
async function fetchBuoyWaveSeries(
  apiKey,
  stationId,
  waveBase = DEFAULT_WAVE_API,
  fetchImpl = fetch,
  window = waveWindow(WAVE_WINDOW_HOURS),
) {
  if (!apiKey) return [];
  const url = buildWaveRequestUrl(stationId, window, waveBase);
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for buoy ${stationId}`);
  const json = await res.json();
  return extractWaveRows(json)
    .map((row) => parseWaveRow(row))
    .filter(Boolean);
}

/**
 * Freshness gate for a buoy reading (rejects stale, future and invalid).
 * @param {string} iso
 * @param {number} [nowMs]
 * @param {number} [maxHours]
 * @returns {boolean}
 */
function isFreshObservation(iso, nowMs = Date.now(), maxHours = MAX_OBS_AGE_HOURS) {
  if (typeof iso !== 'string' || !iso.trim()) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const ageHours = (nowMs - t) / 3_600_000;
  if (ageHours < 0) return false;
  return ageHours <= maxHours;
}

/**
 * Map spots to their nearest ACTIVE buoy (within maxKm). Mirrors fetch-ih-tides.
 * Inactive buoys are skipped so a spot near a dead buoy (e.g. Funchal) falls back
 * to the next live one (e.g. Caniçal) instead of getting no wave data.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Record<string, object>} stations keyed by idEst
 * @param {number} [maxKm]
 * @returns {Record<string, { idEst: number, stationTitle: string, area?: string, distanceKm: number }>}
 */
function mapSpotsToBuoys(spots, stations, maxKm = MAX_BUOY_MAP_KM) {
  const mapping = {};
  const active = Object.values(stations).filter(
    (s) => s.status !== 'inactive' && s.status !== 'inativa',
  );
  for (const spot of spots) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const station of active) {
      const dist = haversineKm(spot.lat, spot.lon, station.lat, station.lon);
      if (dist < nearestDist && dist <= maxKm) {
        nearestDist = dist;
        nearest = station;
      }
    }
    if (nearest) {
      mapping[spot.id] = {
        idEst: nearest.idEst,
        stationTitle: nearest.name,
        area: nearest.area,
        distanceKm: Math.round(nearestDist * 10) / 10,
      };
    }
  }
  return mapping;
}

/**
 * Build the `observedWave` payload for a spot, if the mapped buoy has a fresh
 * reading within the attach radius. Distance is always included so the UI can
 * be honest about a deep-water buoy vs the beach line-up.
 * @param {{ idEst: number, distanceKm: number }} mapping
 * @param {object} station station with an optional `latest` wave snapshot
 * @param {{ maxKm?: number, maxAgeHours?: number, nowMs?: number }} [opts]
 * @returns {object | null}
 */
function observedWaveForSpot(mapping, station, opts = {}) {
  const {
    maxKm = MAX_BUOY_ATTACH_KM,
    maxAgeHours = MAX_OBS_AGE_HOURS,
    nowMs = Date.now(),
  } = opts;
  if (!mapping || !station) return null;
  if (mapping.distanceKm > maxKm) return null;
  const latest = station.latest;
  if (!latest || typeof latest !== 'object') return null;
  if (typeof latest.hm0 !== 'number' || !isFreshObservation(latest.date, nowMs, maxAgeHours)) {
    return null;
  }

  return {
    waveHeight: latest.hm0,
    wavePeriod: typeof latest.tp === 'number' ? latest.tp : undefined,
    waveDirection: typeof latest.thtp === 'number' ? latest.thtp : undefined,
    maxWaveHeight: typeof latest.hmax === 'number' ? latest.hmax : undefined,
    waterTemp: typeof latest.temp === 'number' ? latest.temp : undefined,
    stationName: station.name,
    stationArea: station.area,
    distanceKm: mapping.distanceKm,
    observedAt: latest.date,
    source: 'ih-buoy',
  };
}

module.exports = {
  DEFAULT_IH_API,
  DEFAULT_WAVE_API,
  buildWaveRequestUrl,
  DEFAULT_COLLECTIONS,
  MAX_BUOY_MAP_KM,
  MAX_BUOY_ATTACH_KM,
  MAX_OBS_AGE_HOURS,
  WAVE_WINDOW_HOURS,
  haversineKm,
  normalizeStation,
  fetchBuoyStations,
  extractWaveRows,
  parseWaveRow,
  pickLatestWave,
  waveWindow,
  fetchBuoyWave,
  fetchBuoyWaveSeries,
  isFreshObservation,
  mapSpotsToBuoys,
  observedWaveForSpot,
};
