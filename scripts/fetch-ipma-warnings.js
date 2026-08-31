/**
 * Fetch IPMA weather warnings and bake `public/data/warnings.json`.
 *
 * - warnings_www.json: active (non-green) warnings for mainland + Açores + Madeira.
 * - distrits-islands.json: area → coordinates, used to map each spot to its
 *   nearest warning area (district).
 *
 * IPMA outages must NOT brick the pipeline: on failure we keep the previous
 * warnings.json (if any) and exit 0, like fetch-ih-tides.js / fetch-ih-buoys.js.
 */

const fs = require('fs');
const path = require('path');
const {
  WARNINGS_URL,
  DISTRITS_URL,
  buildWarningsPayload,
} = require('./lib/ipmaWarnings.js');
const { tryMeteoAlarmFallback } = require('./fetch-meteoalarm-warnings.js');

const OUTPUT_PATH =
  process.env.IPMA_WARNINGS_OUTPUT_PATH || path.join(__dirname, '../public/data/warnings.json');
const MAX_STALE_HOURS = 6;

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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
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

async function fetchIPMAWarnings() {
  console.log('⚠️  IPMA - Fetching weather warnings...');

  const [warningsRaw, districtsRaw] = await Promise.all([
    fetchJson(WARNINGS_URL),
    fetchJson(DISTRITS_URL),
  ]);

  const spots = parseSpotsFromFile();
  const payload = buildWarningsPayload(warningsRaw, districtsRaw, spots);

  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

  const withWarnings = Object.keys(payload.spotWarnings).length;
  console.log(`✅ Warnings saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`📊 Active warnings: ${payload.warnings.length} · spots affected: ${withWarnings}/${spots.length}`);
  return payload;
}

async function run() {
  try {
    await fetchIPMAWarnings();
  } catch (err) {
    console.error('❌ IPMA warnings fetch failed:', err.message || err);
    // Secondary source: MeteoAlarm (EUMETNET) takes over when IPMA is down.
    try {
      const used = await tryMeteoAlarmFallback();
      if (used) return;
    } catch (fallbackErr) {
      console.error('❌ MeteoAlarm fallback also failed:', fallbackErr.message || fallbackErr);
    }
    if (fs.existsSync(OUTPUT_PATH)) {
      const age = previousFileAgeHours();
      if (age === null) {
        console.warn('⚠️ Previous warnings.json has unknown age — keeping it; pipeline continues.');
      } else if (age > MAX_STALE_HOURS) {
        console.warn(`⚠️ Previous warnings.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — keeping stale file so the pipeline is not blocked.`);
      } else {
        console.warn('⚠️ Keeping previous public/data/warnings.json — pipeline continues.');
      }
      return;
    }
    console.warn('⚠️ No previous warnings.json — continuing without IPMA warnings.');
  }
}

if (require.main === module) {
  run();
}

module.exports = { fetchIPMAWarnings, run, parseSpotsFromFile };
