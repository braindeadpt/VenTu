/**
 * Ecowitt Cloud API v3 — single PWS snapshot for VenTu observed layer.
 * Credentials: ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY, ECOWITT_MAC (env only).
 */

const { getCardinalLabel } = require('./windCardinal.js');
const { haversineKm, MS_TO_KNOTS, MAX_STATION_DISTANCE_KM, MAX_OBS_AGE_MS } = require('./ipma.js');

const ECOWITT_API = 'https://api.ecowitt.net/api/v3';

function getEcowittCredentials() {
  const application_key = process.env.ECOWITT_APPLICATION_KEY?.trim();
  const api_key = process.env.ECOWITT_API_KEY?.trim();
  const mac = process.env.ECOWITT_MAC?.trim();
  if (!application_key || !api_key || !mac) return null;
  return { application_key, api_key, mac };
}

function deviceQueryParams(creds) {
  const base = {
    application_key: creds.application_key,
    api_key: creds.api_key,
  };
  if (/^\d+$/.test(creds.mac)) {
    base.imei = creds.mac;
  } else {
    base.mac = creds.mac.toUpperCase();
  }
  return base;
}

function buildUrl(path, params) {
  const url = new URL(`${ECOWITT_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function fetchEcowittJson(path, params, retries = 3, fetchImpl = fetch) {
  const url = buildUrl(path, params);
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchImpl(url);
      const text = await res.text();
      const json = JSON.parse(text.replace(/"-"/g, 'null'));
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${json.msg ?? text.slice(0, 120)}`);
      }
      if (json.code !== 0) {
        throw new Error(`Ecowitt code ${json.code}: ${json.msg ?? 'unknown'}`);
      }
      return json;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error('Ecowitt fetch failed');
}

function parseEcowittTime(timeStr) {
  if (timeStr == null || timeStr === '') return new Date();

  const raw = String(timeStr).trim();
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const normalized = raw.replace(' ', 'T');
  const withZ =
    normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}Z`;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Prefer the newest sensor timestamp from Ecowitt real_time payload. */
function observedAtFromRealTime(rtJson) {
  const candidates = [rtJson?.time];
  const wind = rtJson?.data?.wind;
  if (wind && typeof wind === 'object') {
    for (const field of Object.values(wind)) {
      if (field && typeof field === 'object' && field.time != null) {
        candidates.push(field.time);
      }
    }
  }
  let best = new Date(0);
  for (const t of candidates) {
    const d = parseEcowittTime(t);
    if (d.getTime() > best.getTime()) best = d;
  }
  return best.getTime() > 0 ? best : new Date();
}

function sensorValue(block) {
  if (block == null) return null;
  if (typeof block === 'number') return block;
  const v = block.value;
  if (v == null || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {Promise<{ stationName: string, lat: number, lon: number, windSpeedMs: number, windDirDeg: number, windCardinal: string, windCardinalEn: string, tempC?: number, observedAt: string } | null>}
 */
async function fetchEcowittSnapshot({ fetchImpl = fetch, creds } = {}) {
  const resolved = creds ?? getEcowittCredentials();
  if (!resolved) return null;

  const idParams = deviceQueryParams(resolved);

  const infoJson = await fetchEcowittJson('/device/info', idParams, 3, fetchImpl);
  const info = infoJson.data ?? infoJson;
  const lat = Number(info.latitude ?? info.lat);
  const lon = Number(info.longitude ?? info.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Ecowitt device/info missing lat/lon');
  }
  const stationName =
    info.name ?? info.station_name ?? info.device_name ?? info.nickname ?? 'Ecowitt PWS';

  const rtJson = await fetchEcowittJson(
    '/device/real_time',
    {
      ...idParams,
      call_back: 'all',
      temp_unitid: 1,
      wind_speed_unitid: 6,
    },
    3,
    fetchImpl,
  );

  const wind = rtJson.data?.wind;
  const windSpeedMs = sensorValue(wind?.wind_speed);
  const windDirDeg = sensorValue(wind?.wind_direction);
  if (windSpeedMs == null || windDirDeg == null) {
    throw new Error('Ecowitt real_time missing wind_speed or wind_direction');
  }

  const outdoor = rtJson.data?.outdoor;
  let tempC = sensorValue(outdoor?.temperature);
  if (tempC != null && tempC > 60) {
    tempC = ((tempC - 32) * 5) / 9;
  }

  const observedAt = observedAtFromRealTime(rtJson).toISOString();
  const ageMs = Date.now() - new Date(observedAt).getTime();
  if (ageMs > MAX_OBS_AGE_MS) {
    throw new Error(`Ecowitt reading older than ${MAX_OBS_AGE_MS / 3_600_000}h`);
  }

  const cardinal = getCardinalLabel(windDirDeg);

  return {
    stationName: String(stationName),
    lat,
    lon,
    windSpeedMs,
    windDirDeg,
    windCardinal: cardinal,
    windCardinalEn: cardinal,
    tempC: tempC ?? undefined,
    observedAt,
  };
}

/**
 * Build ObservedConditions for a spot from a single Ecowitt PWS snapshot.
 * @returns {object | null}
 */
function buildEcowittObservedForSpot(spot, snapshot) {
  const distanceKm = Math.round(haversineKm(spot.lat, spot.lon, snapshot.lat, snapshot.lon) * 10) / 10;
  if (distanceKm > MAX_STATION_DISTANCE_KM) return null;

  const ageMs = Date.now() - new Date(snapshot.observedAt).getTime();
  if (ageMs > MAX_OBS_AGE_MS) return null;

  return {
    windSpeedKt: Math.round(snapshot.windSpeedMs * MS_TO_KNOTS),
    windDirDeg: snapshot.windDirDeg,
    windCardinal: snapshot.windCardinal,
    windCardinalEn: snapshot.windCardinalEn,
    tempC: snapshot.tempC,
    stationName: snapshot.stationName,
    distanceKm,
    observedAt: snapshot.observedAt,
    source: 'ecowitt',
  };
}

module.exports = {
  getEcowittCredentials,
  fetchEcowittSnapshot,
  buildEcowittObservedForSpot,
  ECOWITT_API,
};
