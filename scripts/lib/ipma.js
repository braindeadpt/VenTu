/**
 * IPMA open-data helpers (stations + hourly observations).
 * @see https://api.ipma.pt/open-data/observation/meteorology/stations/
 */

const IPMA_STATIONS_URL =
  'https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json';
const IPMA_OBSERVATIONS_URL =
  'https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json';

const MS_TO_KNOTS = 1.94384;
const IPMA_MISSING = -99;
const MAX_OBS_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_STATION_DISTANCE_KM = 30;

/** IPMA idDireccVento → degrees (meteorological "from") + cardinal */
const IPMA_WIND_DIR = {
  0: { deg: null, cardinalPt: 'Calmo', cardinalEn: 'Calm' },
  1: { deg: 0, cardinalPt: 'N', cardinalEn: 'N' },
  2: { deg: 45, cardinalPt: 'NE', cardinalEn: 'NE' },
  3: { deg: 90, cardinalPt: 'E', cardinalEn: 'E' },
  4: { deg: 135, cardinalPt: 'SE', cardinalEn: 'SE' },
  5: { deg: 180, cardinalPt: 'S', cardinalEn: 'S' },
  6: { deg: 225, cardinalPt: 'SW', cardinalEn: 'SW' },
  7: { deg: 270, cardinalPt: 'W', cardinalEn: 'W' },
  8: { deg: 315, cardinalPt: 'NW', cardinalEn: 'NW' },
  9: { deg: 0, cardinalPt: 'N', cardinalEn: 'N' },
};

function isMissing(value) {
  return value == null || value === IPMA_MISSING || !Number.isFinite(Number(value));
}

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

function parseSpotsFromFile(spotsPath) {
  const fs = require('fs');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const blockRegex = /\{\s*\n\s*id:\s*['"]([^'"]+)['"]([\s\S]*?)\n\s*\},/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const body = match[2];
    const slugMatch = body.match(/slug:\s*['"]([^'"]+)['"]/);
    const latMatch = body.match(/lat:\s*([0-9.\-]+)/);
    const lonMatch = body.match(/lon:\s*([0-9.\-]+)/);
    const srcMatch = body.match(/conditionsSource:\s*['"]([^'"]+)['"]/);
    if (!latMatch || !lonMatch) continue;
    spots.push({
      id: match[1],
      slug: slugMatch ? slugMatch[1] : match[1],
      lat: parseFloat(latMatch[1]),
      lon: parseFloat(lonMatch[1]),
      conditionsSource: srcMatch ? srcMatch[1] : undefined,
    });
  }
  const seen = new Set();
  return spots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      if (res.status === 429 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error('fetch failed');
}

async function fetchIpmaStations() {
  const data = await fetchJson(IPMA_STATIONS_URL);
  if (!Array.isArray(data)) throw new Error('IPMA stations: expected array');
  return data.map((f) => {
    const [lon, lat] = f.geometry?.coordinates ?? [0, 0];
    const props = f.properties ?? {};
    return {
      idEstacao: props.idEstacao,
      stationName: props.localEstacao ?? String(props.idEstacao),
      lat,
      lon,
    };
  });
}

async function fetchIpmaObservations() {
  const data = await fetchJson(IPMA_OBSERVATIONS_URL);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('IPMA observations: expected object keyed by time');
  }
  return data;
}

function parseIpmaObservedAt(timeKey) {
  // IPMA keys: "YYYY-MM-DDThh:00" (Europe/Lisbon wall clock)
  const withTz = timeKey.includes('+') || timeKey.endsWith('Z')
    ? timeKey
    : `${timeKey}:00+01:00`;
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? new Date(timeKey) : d;
}

function windFromIpmaRow(row) {
  const dir = IPMA_WIND_DIR[row.idDireccVento] ?? IPMA_WIND_DIR[0];
  const speedMs = isMissing(row.intensidadeVento) ? null : Number(row.intensidadeVento);
  if (speedMs == null) return null;
  const windSpeedKt = Math.round(speedMs * MS_TO_KNOTS);
  return {
    windSpeedKt,
    windDirDeg: dir.deg ?? 0,
    windCardinal: dir.cardinalPt,
    windCardinalEn: dir.cardinalEn,
    tempC: isMissing(row.temperatura) ? undefined : Number(row.temperatura),
  };
}

/**
 * Latest hourly snapshot for a station (walks back in time if missing).
 */
function findLatestObservationForStation(observations, idEstacao, maxAgeMs = MAX_OBS_AGE_MS) {
  const now = Date.now();
  const times = Object.keys(observations).sort((a, b) => b.localeCompare(a));

  for (const timeKey of times) {
    const observedAt = parseIpmaObservedAt(timeKey);
    if (now - observedAt.getTime() > maxAgeMs) continue;

    const row = observations[timeKey]?.[String(idEstacao)];
    if (!row) continue;

    const wind = windFromIpmaRow(row);
    if (!wind) continue;

    return {
      observedAt: observedAt.toISOString(),
      observedAtLabel: timeKey,
      ...wind,
    };
  }

  return null;
}

function nearestStations(stations, lat, lon, limit = 3) {
  const ranked = [];
  for (const st of stations) {
    if (st.idEstacao == null) continue;
    const km = haversineKm(lat, lon, st.lat, st.lon);
    ranked.push({
      idEstacao: st.idEstacao,
      stationName: st.stationName,
      distanceKm: Math.round(km * 10) / 10,
    });
  }
  ranked.sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked.slice(0, limit);
}

function nearestStation(stations, lat, lon) {
  const [best] = nearestStations(stations, lat, lon, 1);
  return best ?? null;
}

function stationById(stations, idEstacao) {
  return stations.find((s) => String(s.idEstacao) === String(idEstacao)) ?? null;
}

function buildObservedPayload(obs, stationName, distanceKm) {
  if (distanceKm > MAX_STATION_DISTANCE_KM) return undefined;

  return {
    windSpeedKt: obs.windSpeedKt,
    windDirDeg: obs.windDirDeg,
    windCardinal: obs.windCardinal,
    windCardinalEn: obs.windCardinalEn,
    tempC: obs.tempC,
    stationName,
    distanceKm,
    observedAt: obs.observedAt,
    source: 'ipma',
  };
}

module.exports = {
  IPMA_STATIONS_URL,
  IPMA_OBSERVATIONS_URL,
  IPMA_MISSING,
  MAX_OBS_AGE_MS,
  MAX_STATION_DISTANCE_KM,
  MS_TO_KNOTS,
  parseSpotsFromFile,
  fetchIpmaStations,
  fetchIpmaObservations,
  findLatestObservationForStation,
  nearestStation,
  nearestStations,
  stationById,
  buildObservedPayload,
  haversineKm,
};
