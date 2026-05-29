/**
 * Map each VenTu spot → nearest IPMA meteorological station.
 * Output: public/data/ipma-station-map.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { fetchIpmaStations, nearestStation, parseSpotsFromFile } = require('./lib/ipma.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const spotsPath = path.join(root, 'src/lib/spots.ts');
const outPath = path.join(root, 'public/data/ipma-station-map.json');
const metaPath = path.join(root, 'public/data/ipma-station-map.meta.json');

async function main() {
  console.log('📡 IPMA — building station map...');
  const spots = parseSpotsFromFile(spotsPath);
  const stations = await fetchIpmaStations();
  console.log(`   ${spots.length} spots, ${stations.length} IPMA stations`);

  const map = {};
  let within30 = 0;

  for (const spot of spots) {
    const nearest = nearestStation(stations, spot.lat, spot.lon);
    if (!nearest) continue;
    map[spot.slug] = {
      spotId: spot.id,
      idEstacao: nearest.idEstacao,
      stationName: nearest.stationName,
      distanceKm: nearest.distanceKm,
    };
    if (nearest.distanceKm <= 30) within30++;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(map, null, 2));

  const meta = {
    generatedAt: new Date().toISOString(),
    stationCount: stations.length,
    spotCount: spots.length,
    mappedCount: Object.keys(map).length,
    within30kmCount: within30,
    source: 'https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json',
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log(`✅ Wrote ${Object.keys(map).length} mappings (${within30} within 30 km) → ${outPath}`);
}

main().catch((err) => {
  console.error('❌ build-station-map failed:', err.message);
  process.exit(1);
});
