/**
 * Fetch Copernicus Marine WMO wave buoys (keyless S3) → public/data/wmo-buoys.json.
 *
 * This is the independent fallback for the IH observedWave layer: the same
 * Portuguese buoys the IH serves via its keyed REST API (6201077 off Porto,
 * 6201079 off Faro, 6200199 Nazaré Costeira — Fugro Wavescan) ingested
 * through the WMO/GTS → Copernicus route, which needs NO API key. Spanish
 * Puertos del Estado codes (6200083–85, …) stay in the catalog and enter
 * automatically the day the network resumes reporting to Copernicus.
 *
 * Degradation is identical to the other sources: on any failure (S3 down,
 * parse error, …) we keep the previous wmo-buoys.json and exit 0 — the
 * Open-Meteo pipeline is never blocked by an optional wave layer.
 */

const fs = require('fs');
const path = require('path');
const {
  PLATFORM_CATALOG,
  CATALOG_BY_CODE,
  dayKey,
  listDayWaveKeys,
  fetchNetCdfBytes,
  parseNetCdf,
  surfaceReading,
  isFreshReading,
  mapSpotsToWmoBuoys,
} = require('./lib/copernicusBuoys.js');

const OUTPUT_PATH =
  process.env.WMO_BUOY_OUTPUT_PATH || path.join(__dirname, '../public/data/wmo-buoys.json');
/** Max age of a reused wmo-buoys.json before the pipeline logs it loudly. */
const MAX_STALE_HOURS = 24;

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

/**
 * Download + parse + surface-extract every catalogued platform found in
 * today's S3 folder. One dead buoy never fails the run (allSettled).
 * @param {Array<{ key: string, code: string }>} keys
 * @returns {Promise<Record<string, object>>} buoys keyed by platform code
 */
async function fetchBuoyReadings(keys) {
  const results = await Promise.allSettled(
    keys.map(async ({ key, code }) => {
      const buf = await fetchNetCdfBytes(key);
      const raw = await parseNetCdf(buf);
      const reading = surfaceReading(raw);
      return { code, reading, raw };
    }),
  );

  const buoys = {};
  let ok = 0;
  let failed = 0;
  keys.forEach(({ code }, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.reading) {
      const reading = r.value.reading;
      const meta = CATALOG_BY_CODE[code] ?? {};
      buoys[code] = {
        code,
        name: meta.name || reading.station || `WMO ${code}`,
        area: meta.area,
        country: meta.country,
        lat: reading.lat,
        lon: reading.lon,
        latest: {
          date: reading.date,
          hs: reading.hs,
          tp: reading.tp,
          dir: reading.dir,
          hmax: reading.hmax,
          sst: reading.sst,
        },
      };
      ok += 1;
    } else {
      failed += 1;
      if (r.status === 'rejected') {
        console.warn(`  ⚠️ WMO buoy ${code}: ${r.reason?.message ?? r.reason}`);
      }
    }
  });
  console.log(`   WMO readings: ${ok} ok, ${failed} failed (of ${keys.length} found today)`);
  return buoys;
}

async function fetchWmoBuoys() {
  console.log('🌐 Copernicus Marine — WMO wave buoys (keyless S3)...\n');

  const day = dayKey();
  const keys = await listDayWaveKeys(day);
  if (keys.length === 0) {
    console.warn(`   ⚠️ No catalogued WMO platforms in S3 latest/${day}/ — keeping previous file.`);
    throw new Error(`no WMO keys for ${day}`);
  }
  console.log(`   Found ${keys.length} WMO platform file(s) in latest/${day}/`);

  const buoys = await fetchBuoyReadings(keys);
  const now = Date.now();
  const fresh = Object.values(buoys).filter((b) => isFreshReading(b.latest.date, now));
  console.log(`   ${Object.keys(buoys).length} buoys with data, ${fresh.length} fresh (≤6h)`);

  const spots = parseSpotsFromFile();
  const spotMapping = mapSpotsToWmoBuoys(spots, buoys);
  console.log(`🗺️  Mapped ${Object.keys(spotMapping).length} spots to nearest fresh WMO buoy`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const output = {
    buoys,
    spotMapping,
    day,
    fetchedAt: new Date().toISOString(),
    hasWaveData: fresh.length > 0,
    note: 'Fallback independente para o observedWave do IH (via WMO/GTS → Copernicus, sem key).',
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`✅ WMO buoy data saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(
    `📊 Buoys: ${Object.keys(buoys).length} · Fresh: ${fresh.length} · Mapped spots: ${Object.keys(spotMapping).length}`,
  );
  return output;
}

async function run() {
  try {
    await fetchWmoBuoys();
  } catch (err) {
    console.error('❌ WMO buoy fetch failed:', err.message || err);
    if (fs.existsSync(OUTPUT_PATH)) {
      const age = previousFileAgeHours();
      if (age === null) {
        console.warn('⚠️ Previous wmo-buoys.json has unknown age — keeping it; pipeline continues.');
      } else if (age > MAX_STALE_HOURS) {
        console.warn(`⚠️ Previous wmo-buoys.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — S3 still down; keeping stale file so Open-Meteo/obs are not blocked.`);
      } else {
        console.warn('⚠️ Keeping previous public/data/wmo-buoys.json — pipeline continues.');
      }
      return;
    }
    console.warn('⚠️ No previous wmo-buoys.json — continuing without the WMO fallback layer.');
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  fetchWmoBuoys,
  run,
  parseSpotsFromFile,
  fetchBuoyReadings,
};
