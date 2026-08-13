/**
 * Fetch near-real-time tide stations from Instituto Hidrográfico OGC API.
 *
 * Collection renamed 2026 (IH): tide_obs_stations_nrt → tide_obs_nrt
 * Property rename: last_obs/last_data → last_sea_surface_height/last_date_time
 *
 * IH outages must NOT brick the Open-Meteo pipeline — on failure we keep the
 * previous public/data/ih-tides.json (if any) and exit 0. Stale files (>24h)
 * are logged loudly but still reused: observed tides stay old until IH
 * recovers; forecasts/obs keep updating. validate-generated-data.js treats
 * ttl.ih-tides the same way (warning, not hard-fail).
 */

const fs = require('fs');
const path = require('path');

const IH_API = process.env.IH_API_URL || 'https://api-features.hidrografico.pt';
/** Current collection id (FAQ / OGC).
 *  Legacy id `tide_obs_stations_nrt` was REMOVED from the API in 2026
 *  (404 since 2026-08-13) — a dead fallback only adds a doomed request.
 *  Recovery recipe when the tide backend 500s: EDR endpoints on the same
 *  collection (radius/area, WKT coords) — see docs/BACKLOG.md "Marés".
 */
const COLLECTIONS = ['tide_obs_nrt'];
const OUTPUT_PATH =
  process.env.IH_OUTPUT_PATH || path.join(__dirname, '../public/data/ih-tides.json');
/** Max age of a reused ih-tides.json before the pipeline fails loudly. */
const MAX_STALE_HOURS = 24;

/**
 * EDR fallback (radius por estação conhecida) — `IH_EDR_FALLBACK=1`.
 *
 * Quando `items` falha (ex.: o incidente 2026-08-13 em que o backend de
 * observações devolvia 500), a mesma coleção expõe endpoints OGC API EDR:
 * `radius?coords=POINT(lon lat)&within=50000` devolve as estações a menos
 * de 50km do ponto (formato WKT validado ao vivo — ver docs/BACKLOG.md).
 * As coordenadas vêm do último ih-tides.json conhecido (as estações são
 * marégrafos fixos — a posição não envelhece, mesmo que os dados sim).
 *
 * Default OFF de propósito: com o backend todo em baixo, um fetch completo
 * por estação seria martelar a API partida. Ativar quando o EDR voltar:
 * `IH_EDR_FALLBACK=1` no env do passo do update-data.yml (uma linha).
 * O sample-probe mantém-se mesmo ativo: 2-3 estações primeiro, e se todas
 * falharem o fallback desiste sem disparar N pedidos condenados.
 */
const EDR_FALLBACK = process.env.IH_EDR_FALLBACK === '1';
/** Estações sondadas antes de comprometer o fetch EDR completo. */
const EDR_SAMPLE_STATIONS = 3;
/** Raio de busca em metros à volta de cada estação conhecida. */
const EDR_RADIUS_M = 50_000;

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
  const station = {
    codp: p.codp,
    title: p.title,
    category: p.category,
    lat: p.lat,
    lon: p.lon,
    lastObs,
    lastData,
  };
  // Features EDR podem só trazer a posição na geometry (GeoJSON [lon, lat])
  // — usar como fallback em vez de deixar distâncias NaN no spot mapping.
  if (
    !Number.isFinite(station.lat) &&
    feature.geometry &&
    Array.isArray(feature.geometry.coordinates)
  ) {
    station.lon = feature.geometry.coordinates[0];
    station.lat = feature.geometry.coordinates[1];
  }
  return station;
}

/** Últimas estações conhecidas (marégrafos fixos) para o fallback EDR. */
function lastKnownStations() {
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    const stations = (data && data.stations) || {};
    return Object.values(stations).filter(
      (s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lon)
    );
  } catch {
    return [];
  }
}

/** URL EDR radius — WKT `POINT(lon lat)` (espaço, verificado ao vivo). */
function edrRadiusUrl(lat, lon) {
  const coords = `POINT(${lon} ${lat})`;
  return `${IH_API}/collections/tide_obs_nrt/radius?coords=${encodeURIComponent(coords)}&within=${EDR_RADIUS_M}&f=json`;
}

/**
 * Fetch EDR radius por estação conhecida. Sample-probe primeiro (fail fast
 * se o backend EDR também estiver em baixo), depois fetch completo com
 * features mergeadas — a dedup por codp fica no parse da função principal.
 */
async function fetchEDRRadius(knownStations) {
  const sample = knownStations.slice(0, EDR_SAMPLE_STATIONS);
  console.log(`  Probing EDR radius (${sample.length} sample stations)…`);
  const probes = await Promise.allSettled(
    sample.map((s) => fetchJson(edrRadiusUrl(s.lat, s.lon)))
  );
  const probeOk = probes.filter(
    (r) => r.status === 'fulfilled' && Array.isArray(r.value.features)
  );
  if (probeOk.length === 0) {
    throw new Error(
      'EDR radius probe failed for all sample stations — EDR backend down too'
    );
  }
  if (probeOk.length < sample.length) {
    console.warn(
      `⚠️ EDR probe: ${probeOk.length}/${sample.length} sample stations OK — continuing`
    );
  }

  console.log(`  Fetching EDR radius for ${knownStations.length} known stations…`);
  const results = await Promise.allSettled(
    knownStations.map((s) => fetchJson(edrRadiusUrl(s.lat, s.lon)))
  );
  const features = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value.features)) {
      features.push(...r.value.features);
    }
  });
  if (features.length === 0) {
    throw new Error('EDR radius returned no features');
  }
  return features;
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

  // Fallback EDR (radius por estação conhecida) — apenas com IH_EDR_FALLBACK=1.
  if (!stationsData && EDR_FALLBACK) {
    console.log('🔀 items failed — trying EDR radius fallback…');
    try {
      const known = lastKnownStations();
      if (known.length === 0) {
        errors.push(
          'EDR radius: no last-known station coordinates (no previous ih-tides.json)'
        );
      } else {
        const features = await fetchEDRRadius(known);
        stationsData = { features };
        usedCollection = 'tide_obs_nrt/radius';
      }
    } catch (err) {
      errors.push(`EDR radius fallback: ${err.message}`);
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
  return output;
}

/**
 * Ponto de entrada do pipeline (CLI). Separado para o módulo poder ser
 * importado nos testes unitários sem disparar o run — quando importado via
 * require(), `require.main` é o entrypoint do runner, não este ficheiro.
 */
async function run() {
  try {
    await fetchIHTides();
  } catch (err) {
    console.error('❌ IH tide fetch failed:', err.message || err);
    if (fs.existsSync(OUTPUT_PATH)) {
      const age = previousFileAgeHours();
      if (age === null) {
        console.warn(
          '⚠️ Previous ih-tides.json has unknown age (missing/invalid fetchedAt) — keeping it; Open-Meteo pipeline continues.'
        );
      } else if (age > MAX_STALE_HOURS) {
        console.warn(
          `⚠️ Previous ih-tides.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — IH still down; keeping stale file so Open-Meteo/obs are not blocked.`
        );
      } else {
        console.warn('⚠️ Keeping previous public/data/ih-tides.json — Open-Meteo pipeline continues.');
      }
      return;
    }
    console.warn('⚠️ No previous ih-tides.json — continuing without IH observed tides.');
  }
}

// Só corre como CLI (`node scripts/fetch-ih-tides.js`); nos testes (vitest)
// importa-se o módulo e chama-se fetchIHTides/run diretamente.
if (require.main === module) {
  run();
}

module.exports = {
  fetchIHTides,
  fetchEDRRadius,
  edrRadiusUrl,
  stationFromFeature,
  lastKnownStations,
  run,
  IH_API,
  EDR_SAMPLE_STATIONS,
  EDR_RADIUS_M,
};

// Nota: sem `process.exit()` no catch — no Windows, forçar a terminação enquanto
// o keep-alive socket do fetch está a fechar dispara uma asserção libuv
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). `process.exitCode`
// + drenagem natural do event loop preserva o exit code sem a raça (os sockets
// idle do undici são unref'd — o processo termina sozinho com o código certo).
