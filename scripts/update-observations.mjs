/**
 * Merge IPMA observed wind into conditions.json (does not affect scores).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildObservedPayload,
  fetchIpmaObservations,
  findLatestObservationForStation,
  parseSpotsFromFile,
  MAX_STATION_DISTANCE_KM,
} = require('./lib/ipma.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mapPath = path.join(root, 'public/data/ipma-station-map.json');
const conditionsPath = path.join(root, 'public/data/conditions.json');
const spotsPath = path.join(root, 'src/lib/spots.ts');

async function main() {
  console.log('🌡️ IPMA — updating observations in conditions.json...');

  if (!fs.existsSync(conditionsPath)) {
    console.error('❌ conditions.json missing — run npm run conditions:update first');
    process.exit(1);
  }

  if (!fs.existsSync(mapPath)) {
    console.error('❌ ipma-station-map.json missing — run npm run obs:map first');
    process.exit(1);
  }

  const stationMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  const conditions = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
  const spots = parseSpotsFromFile(spotsPath);
  const slugById = Object.fromEntries(spots.map((s) => [s.id, s.slug]));
  const aliasSpots = spots.filter((s) => s.conditionsSource);

  let observations;
  try {
    observations = await fetchIpmaObservations();
    const times = Object.keys(observations);
    console.log(`   Observations: ${times.length} hourly snapshots`);
  } catch (err) {
    console.warn(`⚠️ IPMA observations fetch failed: ${err.message}`);
    console.warn('   Leaving conditions.json unchanged (no observed layer).');
    return;
  }

  let withObserved = 0;

  for (const [slug, mapping] of Object.entries(stationMap)) {
    const spotId = mapping.spotId ?? slug;
    if (!conditions[spotId]) continue;

    const obs = findLatestObservationForStation(observations, mapping.idEstacao);
    if (!obs) {
      delete conditions[spotId].observed;
      continue;
    }

    const observed = buildObservedPayload(obs, mapping.stationName, mapping.distanceKm);
    if (observed) {
      conditions[spotId].observed = observed;
      withObserved++;
    } else if (mapping.distanceKm > MAX_STATION_DISTANCE_KM) {
      delete conditions[spotId].observed;
    }
  }

  for (const spot of aliasSpots) {
    const srcId = spot.conditionsSource;
    const srcSlug = slugById[srcId];
    if (!srcSlug || !stationMap[srcSlug]) continue;
    const srcObserved = conditions[srcId]?.observed;
    if (srcObserved) {
      conditions[spot.id].observed = { ...srcObserved };
    } else {
      delete conditions[spot.id].observed;
    }
  }

  fs.writeFileSync(conditionsPath, JSON.stringify(conditions, null, 2));
  console.log(`✅ observed attached to ${withObserved} spots (≤${MAX_STATION_DISTANCE_KM} km, ≤3h fresh)`);
}

main().catch((err) => {
  console.error('❌ update-observations failed:', err.message);
  // Do not fail the data pipeline — forecast layer still ships without observed IPMA
  process.exit(0);
});
