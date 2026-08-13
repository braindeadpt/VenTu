/**
 * Fetch near-real-time tide stations from Instituto Hidrográfico OGC API.
 *
 * Collection renamed 2026 (IH): tide_obs_stations_nrt → tide_obs_nrt
 * Property rename: last_obs/last_data → last_sea_surface_height/last_date_time
 *
 * IH outages must NOT brick the Open-Meteo pipeline — on failure we keep the
 * previous public/data/ih-tides.json (if any) and exit 0, BUT only while that
 * file is fresher than MAX_STALE_HOURS (24h). Reusing a file older than 24h
 * means IH has been down for a full day — we fail loudly (exit 1) instead of
 * silently shipping stale observed tides. Mirrors TTL_TIDES_H in
 * validate-generated-data.js (both catch multi-day staleness like the
 * 2026-07-29 outage that left fetchedAt 14 days old).
 */

const fs = require('fs');
const path = require('path');

const IH_API = 'https://api-features.hidrografico.pt';
/** Current collection id (FAQ / OGC).
 *  Legacy id `tide_obs_stations_nrt` was REMOVED from the API in 2026
 *  (404 since 2026-08-13) — a dead fallback only adds a doomed request.
 *  Recovery recipe when the tide backend 500s: EDR endpoints on the same
 *  collection (radius/area, WKT coords) — see docs/BACKLOG.md "Marés".
 */
const COLLECTIONS = ['tide_obs_nrt'];
const OUTPUT_PATH = path.join(__dirname, '../public/data/ih-tides.json');
/** Max age of a reused ih-tides.json before the pipeline fails loudly. */
const MAX_STALE_HOURS = 24;

/**
 * Age in hours of the previous ih-tides.json, or null if it can't be
 * determined (unreadable, missing/invalid fetchedAt). Unknown age = fail
 * closed: never silently reuse a file we can't prove is fresh.
 */
function previousFileAgeHours() {
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    const t = data && data.fetchedAt ? new Date(data.fetchedAt).getTime() : NaN;
    if (Number.isNaN(t)) return null;
    return (Date.now() - t) / 3_600_000;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function haversineDistance(lat1, lon1, lat2, lon2) {
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

function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({ id: match[1], lat: parseFloat(match[2]), lon: parseFloat(match[3]) });
  }
  const seen = new Set();
  return spots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/** Normalise IH property names (old + new schema) into our internal shape. */
function stationFromFeature(feature) {
  const p = feature.properties || {};
  const lastObs = p.last_sea_surface_height ?? p.last_obs;
  const lastData = p.last_date_time ?? p.last_data;
  if (p.codp == null || lastObs == null || !lastData) return null;
  return {
    codp: p.codp,
    title: p.title,
    category: p.category,
    lat: p.lat,
    lon: p.lon,
    lastObs,
    lastData,
  };
}

async function fetchStationsCollection(collectionId) {
  const url = `${IH_API}/collections/${collectionId}/items?limit=100&f=json`;
  console.log(`  Trying collection ${collectionId}…`);
  const stationsData = await fetchJson(url);
  if (!Array.isArray(stationsData.features)) {
    throw new Error(`No features in ${collectionId}`);
  }
  return stationsData;
}

async function fetchIHTides() {
  console.log('🌊 IH OGC API - Fetching tide station data...\n');

  let stationsData = null;
  let usedCollection = null;
  const errors = [];

  for (const id of COLLECTIONS) {
    try {
      stationsData = await fetchStationsCollection(id);
      usedCollection = id;
      break;
    } catch (err) {
      errors.push(`${id}: ${err.message}`);
    }
  }

  if (!stationsData) {
    throw new Error(
      `All IH tide collections failed — ${errors.join('; ')}. ` +
      'Diagnóstico: se TODOS os endpoints de tide_obs_nrt (items, radius, area, locations) ' +
      'devolvem 500/NoApplicableCode, o backend de observações IH está em baixo ' +
      '(outras coleções como buoys_datawell continuam OK). Ver docs/BACKLOG.md "Marés" ' +
      'para a receita de recuperação (EDR WKT).'
    );
  }

  console.log(`📦 Using collection: ${usedCollection}\n`);

  const stations = {};
  for (const feature of stationsData.features) {
    const station = stationFromFeature(feature);
    if (station) stations[station.codp] = station;
  }

  console.log(`📍 Found ${Object.keys(stations).length} active tide stations\n`);
  if (Object.keys(stations).length === 0) {
    throw new Error('IH returned features but none had usable obs fields');
  }

  const spots = parseSpotsFromFile();

  const spotMapping = {};
  for (const spot of spots) {
    let nearestCodp = null;
    let nearestDist = Infinity;
    for (const [codp, station] of Object.entries(stations)) {
      const dist = haversineDistance(spot.lat, spot.lon, station.lat, station.lon);
      if (dist < nearestDist && dist < 120) {
        nearestDist = dist;
        nearestCodp = codp;
      }
    }
    if (nearestCodp) {
      spotMapping[spot.id] = {
        codp: parseInt(nearestCodp, 10),
        stationTitle: stations[nearestCodp].title,
        distanceKm: Math.round(nearestDist * 10) / 10,
      };
    }
  }

  console.log(`🗺️  Mapped ${Object.keys(spotMapping).length} spots to nearest stations\n`);

  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });

  const output = {
    stations,
    spotMapping,
    fetchedAt: new Date().toISOString(),
    sourceCollection: usedCollection,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`✅ IH tide data saved to public/data/ih-tides.json`);
  console.log(`📊 Stations: ${Object.keys(stations).length}`);
  console.log(`📊 Mapped spots: ${Object.keys(spotMapping).length}`);
}

fetchIHTides().catch((err) => {
  console.error('❌ IH tide fetch failed:', err.message || err);
  if (fs.existsSync(OUTPUT_PATH)) {
    const age = previousFileAgeHours();
    if (age === null || age > MAX_STALE_HOURS) {
      console.error(
        age === null
          ? `❌ Previous ih-tides.json has unknown age (missing/invalid fetchedAt) — failing loudly (exit 1).`
          : `❌ Previous ih-tides.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — IH unavailable too long; failing loudly (exit 1).`
      );
      process.exit(1);
    }
    console.warn('⚠️ Keeping previous public/data/ih-tides.json — Open-Meteo pipeline continues.');
    process.exit(0);
  }
  console.warn('⚠️ No previous ih-tides.json — continuing without IH observed tides.');
  process.exit(0);
});
