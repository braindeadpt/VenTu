/**
 * Merge IPMA + Ecowitt into conditions.json (observed layer; scores use it when fresh).
 * Rule: nearest station within 30 km and ≤3 h fresh wins; tie → freshest.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildObservedPayload,
  fetchIpmaObservations,
  findLatestObservationForStation,
  parseSpotsFromFile,
  MAX_STATION_DISTANCE_KM,
} = require('./lib/ipma.js');
const { fetchEcowittSnapshot, buildEcowittObservedForSpot, getEcowittCredentials } = require('./lib/ecowitt.js');
const { pickBestObservation } = require('./lib/observationPick.js');
const { writePipelineMeta } = require('./lib/pipelineMeta.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mapPath = path.join(root, 'public/data/ipma-station-map.json');
const conditionsPath = path.join(root, 'public/data/conditions.json');
const spotsPath = path.join(root, 'src/lib/spots.ts');

export async function mergeObservations() {
  console.log('🌡️ Observations — IPMA + Ecowitt → conditions.json...');

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
  const spotById = Object.fromEntries(spots.map((s) => [s.id, s]));

  let ipmaSnapshots = null;
  try {
    ipmaSnapshots = await fetchIpmaObservations();
    console.log(`   IPMA: ${Object.keys(ipmaSnapshots).length} hourly snapshots`);
  } catch (err) {
    console.warn(`⚠️ IPMA fetch failed: ${err.message}`);
  }

  let ecowittSnapshot = null;
  if (getEcowittCredentials()) {
    try {
      ecowittSnapshot = await fetchEcowittSnapshot();
      console.log(
        `   Ecowitt: ${ecowittSnapshot.stationName} @ ${ecowittSnapshot.lat.toFixed(5)}, ${ecowittSnapshot.lon.toFixed(5)}`,
      );
    } catch (err) {
      console.warn(`⚠️ Ecowitt fetch failed: ${err.message}`);
    }
  } else {
    console.log('   Ecowitt: skipped (ECOWITT_* env not set)');
  }

  let withObserved = 0;
  let ecowittWins = 0;
  let ipmaWins = 0;

  for (const spot of spots) {
    if (spot.conditionsSource) continue;
    if (!conditions[spot.id]) continue;

    const mapping = stationMap[spot.slug];
    let ipmaCandidate = null;
    if (mapping && ipmaSnapshots) {
      const obs = findLatestObservationForStation(ipmaSnapshots, mapping.idEstacao);
      if (obs) {
        ipmaCandidate = buildObservedPayload(obs, mapping.stationName, mapping.distanceKm);
      }
    }

    let ecowittCandidate = null;
    if (ecowittSnapshot) {
      ecowittCandidate = buildEcowittObservedForSpot(spot, ecowittSnapshot);
    }

    const picked = pickBestObservation(ipmaCandidate, ecowittCandidate);
    if (picked) {
      conditions[spot.id].observed = picked;
      withObserved++;
      if (picked.source === 'ecowitt') ecowittWins++;
      else ipmaWins++;
    } else {
      delete conditions[spot.id].observed;
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
  writePipelineMeta('observations', new Date(), root);
  console.log(
    `✅ observed on ${withObserved} spots (≤${MAX_STATION_DISTANCE_KM} km, ≤3h) — IPMA: ${ipmaWins}, Ecowitt: ${ecowittWins}`,
  );

  return { withObserved, ecowittWins, ipmaWins, ecowittSnapshot };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  mergeObservations().catch((err) => {
    console.error('❌ merge-observations failed:', err.message);
    process.exit(1);
  });
}
