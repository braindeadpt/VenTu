/**
 * Fetch IH coastal isobaths (depcnt_8_16_30) and bake
 * `public/data/spot-isobaths.json`.
 *
 * For every spot, computes the distance from the shore point to the nearest
 * 8/16/30 m depth contour (the real bathymetry near the beach) — served
 * keyless by the IH OGC API (152 MultiLineString features, `depth` property).
 *
 * IH outages must NOT brick the pipeline: on failure we keep the previous
 * spot-isobaths.json (if any) and exit 0, exactly like fetch-ih-buoys.js.
 */

const fs = require('fs');
const path = require('path');
const {
  fetchIsobathFeatures,
  buildSpotIsobaths,
  DEPTHS,
} = require('./lib/ihIsobaths.js');

const IH_API = process.env.IH_API_URL || require('./lib/ihIsobaths.js').DEFAULT_IH_API;
const OUTPUT_PATH =
  process.env.ISOBATHS_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/spot-isobaths.json');
/** Max age of a reused spot-isobaths.json before the pipeline logs it loudly. */
const MAX_STALE_HOURS = 24 * 7; // bathymetry changes slowly — weekly staleness is fine

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

async function fetchIsobaths() {
  console.log('🗺️  IH isobaths (depcnt_8_16_30) — depth contours 8/16/30 m...\n');

  const features = await fetchIsobathFeatures(fetch, IH_API);
  const byDepth = {};
  for (const f of features) byDepth[f.depth] = (byDepth[f.depth] || 0) + 1;
  console.log(`   ${features.length} contour features (${DEPTHS.map((d) => `${d} m: ${byDepth[d] ?? 0}`).join(', ')})`);

  const spots = parseSpotsFromFile();
  const spotDepths = buildSpotIsobaths(spots, features);
  const withData = Object.keys(spotDepths).length;
  console.log(`   ${withData}/${spots.length} spots with a nearby contour`);

  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });
  const output = {
    spots: spotDepths,
    fetchedAt: new Date().toISOString(),
    sourceCollection: 'depcnt_8_16_30',
    sourceUrl: `${IH_API}/collections/depcnt_8_16_30`,
    depths: DEPTHS,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✅ Isobaths saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  return output;
}

async function run() {
  try {
    await fetchIsobaths();
  } catch (err) {
    console.error('❌ IH isobaths fetch failed:', err.message || err);
    if (fs.existsSync(OUTPUT_PATH)) {
      const age = previousFileAgeHours();
      if (age === null) {
        console.warn('⚠️ Previous spot-isobaths.json has unknown age — keeping it; pipeline continues.');
      } else if (age > MAX_STALE_HOURS) {
        console.warn(`⚠️ Previous spot-isobaths.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — keeping stale file so the pipeline is not blocked.`);
      } else {
        console.warn('⚠️ Keeping previous public/data/spot-isobaths.json — pipeline continues.');
      }
      return;
    }
    console.warn('⚠️ No previous spot-isobaths.json — continuing without isobath data.');
  }
}

// Só corre como CLI; nos testes importa-se o módulo e chama-se fetchIsobaths.
if (require.main === module) {
  run();
}

module.exports = {
  fetchIsobaths,
  run,
  parseSpotsFromFile,
};
