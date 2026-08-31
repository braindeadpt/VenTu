/**
 * Fetch IH coastal navigation warnings (nav_warning_coastal) and bake
 * `public/data/ih-coastal-warnings.json`.
 *
 * Avisos à Navegação Costeiros em vigor (keyless OGC API) — per-spot coverage
 * via point-in-polygon, so the spot page can show which navigation warnings
 * actually cover it (complement to IPMA/MeteoAlarm, focused on maritime
 * safety: exercises, hazards, restrictions).
 *
 * IH outages must NOT brick the pipeline: on failure we keep the previous
 * file (if any) and exit 0, like the other IH fetches.
 */

const fs = require('fs');
const path = require('path');
const {
  fetchCoastalWarnings,
  buildSpotCoverage,
  DEFAULT_IH_API,
} = require('./lib/ihCoastalWarnings.js');

const IH_API = process.env.IH_API_URL || DEFAULT_IH_API;
const OUTPUT_PATH =
  process.env.IH_COASTAL_WARNINGS_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/ih-coastal-warnings.json');
/** Avisos à navegação mudam devagar — staleness semanal é aceitável. */
const MAX_STALE_HOURS = 24 * 7;

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

async function fetchCoastalWarningsData() {
  console.log('⚠️  IH coastal navigation warnings (nav_warning_coastal)...\n');

  const warnings = await fetchCoastalWarnings(fetch, IH_API);
  console.log(`   ${warnings.length} warnings in force`);

  const spots = parseSpotsFromFile();
  const coverage = buildSpotCoverage(spots, warnings);
  const covered = Object.keys(coverage).length;
  console.log(`   ${covered}/${spots.length} spots covered by at least one warning`);

  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });
  const output = {
    warnings,
    coverage,
    fetchedAt: new Date().toISOString(),
    sourceCollection: 'nav_warning_coastal',
    sourceUrl: `${IH_API}/collections/nav_warning_coastal`,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✅ Coastal warnings saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  return output;
}

async function run() {
  try {
    await fetchCoastalWarningsData();
  } catch (err) {
    console.error('❌ IH coastal warnings fetch failed:', err.message || err);
    if (fs.existsSync(OUTPUT_PATH)) {
      const age = previousFileAgeHours();
      if (age === null) {
        console.warn('⚠️ Previous ih-coastal-warnings.json has unknown age — keeping it; pipeline continues.');
      } else if (age > MAX_STALE_HOURS) {
        console.warn(`⚠️ Previous ih-coastal-warnings.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — keeping stale file so the pipeline is not blocked.`);
      } else {
        console.warn('⚠️ Keeping previous public/data/ih-coastal-warnings.json — pipeline continues.');
      }
      return;
    }
    console.warn('⚠️ No previous ih-coastal-warnings.json — continuing without navigation warnings.');
  }
}

// Só corre como CLI; nos testes importa-se o módulo e chama-se fetchCoastalWarningsData.
if (require.main === module) {
  run();
}

module.exports = {
  fetchCoastalWarningsData,
  run,
  parseSpotsFromFile,
};
