/**
 * Map each VenTu spot → nearest IPMA meteorological station (+ alternates).
 * Caparica / Almada strip is forced to Almada P.Rainha (ocean-side) so we do not
 * pick Oeiras across the Tagus (cova-do-vapor bug).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  fetchIpmaStations,
  nearestStations,
  stationById,
  parseSpotsFromFile,
  haversineKm,
} = require('./lib/ipma.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const spotsPath = path.join(root, 'src/lib/spots.ts');
const outPath = path.join(root, 'public/data/ipma-station-map.json');
const metaPath = path.join(root, 'public/data/ipma-station-map.meta.json');

/** West Caparica / Almada kite strip — prefer Almada coastal station over Tagus-crossing nearest. */
const FORCE_ALMADA_P_RAINHA = new Set([
  'nova-vaga',
  'costa-caparica',
  'sao-joao-caparica',
  'fonte-telha',
  'praia-da-rainha',
  'trafaria',
  'cova-do-vapor',
]);
const ALMADA_ID = 1210773;

function mappingFromStation(st, lat, lon) {
  const km = haversineKm(lat, lon, st.lat, st.lon);
  return {
    idEstacao: st.idEstacao,
    stationName: st.stationName,
    distanceKm: Math.round(km * 10) / 10,
  };
}

async function main() {
  console.log('📡 IPMA — building station map...');
  const spots = parseSpotsFromFile(spotsPath);
  let stations;
  try {
    stations = await fetchIpmaStations();
  } catch (err) {
    if (fs.existsSync(outPath)) {
      console.warn(`⚠️ IPMA stations unavailable (${err.message}) — keeping existing ${outPath}`);
      return;
    }
    throw err;
  }
  console.log(`   ${spots.length} spots, ${stations.length} IPMA stations`);

  const map = {};
  let within30 = 0;
  let forced = 0;

  for (const spot of spots) {
    const ranked = nearestStations(stations, spot.lat, spot.lon, 4);
    if (ranked.length === 0) continue;

    let primary = ranked[0];
    if (FORCE_ALMADA_P_RAINHA.has(spot.id)) {
      const almada = stationById(stations, ALMADA_ID);
      if (almada) {
        primary = mappingFromStation(almada, spot.lat, spot.lon);
        forced++;
      }
    }

    const alternates = ranked
      .filter((s) => String(s.idEstacao) !== String(primary.idEstacao))
      .slice(0, 3);

    map[spot.slug] = {
      spotId: spot.id,
      idEstacao: primary.idEstacao,
      stationName: primary.stationName,
      distanceKm: primary.distanceKm,
      alternates,
    };
    if (primary.distanceKm <= 30) within30++;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(map, null, 2));

  const meta = {
    generatedAt: new Date().toISOString(),
    stationCount: stations.length,
    spotCount: spots.length,
    mappedCount: Object.keys(map).length,
    within30kmCount: within30,
    forcedAlmadaCount: forced,
    source: 'https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json',
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log(
    `✅ Wrote ${Object.keys(map).length} mappings (${within30} within 30 km, ${forced} Caparica→Almada) → ${outPath}`,
  );
}

main().catch((err) => {
  console.error('❌ build-station-map failed:', err.message);
  process.exit(1);
});
