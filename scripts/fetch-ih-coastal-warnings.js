/**
 * Fetch IH coastal navigation warnings (nav_warning_coastal) and bake
 * `public/data/ih-coastal-warnings.json`.
 *
 * Avisos à Navegação Costeiros em vigor (keyless OGC API) — per-spot coverage
 * via point-in-polygon, so the spot page can show which navigation warnings
 * actually cover it (complement to IPMA/MeteoAlarm, focused on maritime
 * safety: exercises, hazards, restrictions).
 *
 * Cross-border NW: quando ES_NAV_WARNINGS_URL apontar para um feed GeoJSON dos
 * «Avisos a los navegantes» espanhóis (Instituto Hidrográfico de la Marina),
 * os avisos ES entram na MESMA camada com source:'es' — a secção e o mapa
 * mostram-nos separadamente ao lado dos do IH (p.ex. no Minho/estuários). Sem
 * URL configurado a camada escreve es:[] e degrada sem falhar (ver nota da
 * investigação em scripts/lib/ihCoastalWarnings.js — sem API ES keyless hoje).
 *
 * IH outages must NOT brick the pipeline: on failure we keep the previous
 * file (if any) and exit 0, like the other IH fetches. O mesmo vale para a
 * fonte ES: se o feed falhar, avisamos mas continuamos com os do IH.
 */

const fs = require('fs');
const path = require('path');
const {
  fetchCoastalWarnings,
  fetchEsNavWarnings,
  buildSpotCoverage,
  DEFAULT_IH_API,
} = require('./lib/ihCoastalWarnings.js');
const {
  DEFAULT_OUTPUT_PATH: ARCHIVE_DEFAULT_PATH,
  readArchive,
  writeArchive,
  mergeDaySnapshot,
  pruneArchive,
  buildReport,
} = require('./lib/coastalWarningsArchive.js');

const IH_API = process.env.IH_API_URL || DEFAULT_IH_API;
/** Feed GeoJSON dos «Avisos a los navegantes» espanhóis (cross-border NW). */
const ES_NAV_WARNINGS_URL = process.env.ES_NAV_WARNINGS_URL?.trim() || '';
const OUTPUT_PATH =
  process.env.IH_COASTAL_WARNINGS_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/ih-coastal-warnings.json');
const ARCHIVE_PATH =
  process.env.IH_COASTAL_WARNINGS_ARCHIVE_PATH || ARCHIVE_DEFAULT_PATH;
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
  console.log(`   🇵🇹 ${warnings.length} IH warnings in force`);

  // Cross-border NW: «Avisos a los navegantes» espanhóis (opcional). Sem URL o
  // layer degrada sem falhar; se o feed existir mas falhar, avisamos e seguimos
  // com os do IH (a fonte ES nunca bloqueia a pipeline). O estado da fonte é
  // gravado em `esHealth` (e no `esSourceNote`) para o health-check avisar
  // quando o feed ES estiver configurado mas devolver erros repetidos.
  let prevEsHealth = null;
  try {
    if (fs.existsSync(OUTPUT_PATH)) {
      prevEsHealth = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')).esHealth ?? null;
    }
  } catch {
    /* noop */
  }
  const esWarnings = [];
  let esHealth;
  if (!ES_NAV_WARNINGS_URL) {
    console.log(
      '   🇪🇸 ES_NAV_WARNINGS_URL não configurada — sem avisos ES cross-border ' +
        '(fonte oficial espanhola sem API keyless; ver nota na lib).',
    );
    esHealth = { configured: false, status: 'disabled' };
  } else {
    try {
      esWarnings.push(...(await fetchEsNavWarnings(fetch, ES_NAV_WARNINGS_URL)));
      console.log(`   🇪🇸 ${esWarnings.length} ES warnings (Avisos a los navegantes)`);
      esHealth = {
        configured: true,
        status: 'ok',
        lastOkAt: new Date().toISOString(),
        lastErrorAt: prevEsHealth?.lastErrorAt ?? undefined,
      };
    } catch (err) {
      console.warn(`   ⚠️ ES nav warnings failed: ${err.message} — seguindo só com os do IH.`);
      esHealth = {
        configured: true,
        status: 'error',
        error: String(err.message || err).slice(0, 200),
        lastErrorAt: new Date().toISOString(),
        lastOkAt: prevEsHealth?.lastOkAt ?? undefined,
      };
    }
  }

  const all = [...warnings, ...esWarnings];
  const spots = parseSpotsFromFile();
  const coverage = buildSpotCoverage(spots, all);
  const covered = Object.keys(coverage).length;
  console.log(`   ${covered}/${spots.length} spots covered by at least one warning`);

  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });
  const esSourceNote = !ES_NAV_WARNINGS_URL
    ? 'Sem feed ES configurado (ES_NAV_WARNINGS_URL) — os avisos espanhóis não entram.'
    : esHealth.status === 'error'
      ? `Avisos a los navegantes — feed ES em ERRO (${esHealth.error}) desde ${esHealth.lastErrorAt}.`
      : 'Avisos a los navegantes — fonte espanhola cross-border (ES_NAV_WARNINGS_URL).';
  const output = {
    warnings: all,
    coverage,
    es: esWarnings,
    esSourceNote,
    esHealth,
    fetchedAt: new Date().toISOString(),
    sourceCollection: 'nav_warning_coastal',
    sourceUrl: `${IH_API}/collections/nav_warning_coastal`,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✅ Coastal warnings saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);

  // Arquivo diário (best-effort — um erro aqui nunca bloqueia a pipeline): o
  // ficheiro principal só tem os avisos EM VIGOR hoje; o arquivo acumula o
  // snapshot por dia para o About mostrar quando cada aviso esteve em vigor.
  try {
    const archive = readArchive(ARCHIVE_PATH);
    const { replaced } = mergeDaySnapshot(archive, all);
    pruneArchive(archive);
    buildReport(archive);
    writeArchive(archive, ARCHIVE_PATH);
    console.log(
      `   🗂️  Archive: ${archive.dayCount} dias · ${archive.refs.length} avisos únicos (snapshot de hoje ${replaced ? 'substituído' : 'adicionado'})`,
    );
  } catch (err) {
    console.warn(`   ⚠️ Coastal warnings archive failed: ${err.message} — continuando sem arquivar.`);
  }

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
