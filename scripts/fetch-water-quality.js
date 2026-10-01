/**
 * Fetch bathing-water quality per spot from APA InfoÁgua.
 *
 *   https://infoagua.apambiente.pt/pt/praias
 *
 * The beaches page embeds the full national bathing-water dataset inline as JS
 * literals (DATA_BeachesData / DATA_BeachesAlerts / DATA_BeachQualityMap) —
 * one unauthenticated GET, pt+en strings included. Each spot is mapped to
 * the nearest designated bathing water within MAX_BEACH_KM; the record
 * keeps beach name + distKm so the mapping stays honest.
 *
 * Live advice (ultima_classificacao: 0 sem análises / 1 adequada /
 * 2 desaconselhada) is only meaningful inside each beach's época balnear —
 * the season window travels in the record and is evaluated at render time.
 *
 * Output: public/data/water-quality.json
 */

const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const { buildWaterQualityArtifact } = require('./lib/waterQuality.js');
const { spots } = require('./update-conditions.js');

const APA_HOME = 'https://infoagua.apambiente.pt/pt/praias';
const OUTPUT_PATH =
  process.env.WATER_QUALITY_OUTPUT_PATH || path.join(__dirname, '../public/data/water-quality.json');
const MIN_BEACHES = 500;
const MIN_COVERAGE = 0.8;

async function fetchText(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`💧 VenTu — qualidade da água APA InfoÁgua (${spots.length} spots)`);
  const html = await fetchText(APA_HOME);
  const artifact = buildWaterQualityArtifact(html, spots, new Date().toISOString());
  if (!artifact) throw new Error('DATA_BeachesData não encontrado na homepage');
  if (artifact.beaches < MIN_BEACHES) {
    throw new Error(`só ${artifact.beaches} águas balneares (< ${MIN_BEACHES}) — dataset truncado?`);
  }
  const coverage = Object.keys(artifact.spots).length / Math.max(spots.length, 1);
  if (coverage < MIN_COVERAGE) {
    throw new Error(`coverage ${(coverage * 100).toFixed(1)}% < ${MIN_COVERAGE * 100}%`);
  }

  atomicWriteJson(OUTPUT_PATH, artifact);
  console.log(
    `✅ ${Object.keys(artifact.spots).length}/${spots.length} spots · ` +
      `${artifact.beaches} águas balneares · ${artifact.activeAlerts} alertas → ${OUTPUT_PATH}`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
