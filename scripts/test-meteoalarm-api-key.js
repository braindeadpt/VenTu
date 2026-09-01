/**
 * End-to-end test for the MeteoAlarm (EUMETNET) API token (METEOALARM_API_KEY).
 *
 * Validates the whole chain in one command:
 *   1. EDR locations query for PT (MeteoGate apikey or MeteoAlarm Bearer).
 *   2. CAP Oasis 1.2 payload fetch (signed URL, no auth) — parse a warning.
 *   3. buildMeteoAlarmPayload over real spots — spotWarnings mapping works.
 *
 * Usage:
 *   METEOGATE_API_KEY=... node scripts/test-meteoalarm-api-key.js
 *
 * Exit codes:
 *   0  — token OK and the chain works end-to-end (payload source 'meteoalarm';
 *        even a quiet day with zero active warnings still passes — the API
 *        responded with the token).
 *   1  — token missing/invalid, or no data could be parsed (see output).
 *
 * The chain logic lives in `runMeteoAlarmApiKeyTest()` (exported, testable with
 * a mocked fetch); the CLI wrapper below maps its exit code to process.exit.
 *
 * Full setup guide (get the free token + create the GitHub secret):
 *   docs/METEOALARM_API_KEY.md
 */

const {
  fetchFeaturesPage,
  capJsonUrl,
  capToWarning,
  buildMeteoAlarmPayload,
  resolveWarningsAuth,
} = require('./lib/meteoalarmWarnings.js');

function parseSpotsFromFile() {
  const fs = require('fs');
  const path = require('path');
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

/**
 * The full token-diagnosis chain. Returns the exit code (0 PASS / 1 FAIL)
 * instead of calling process.exit, and accepts a mocked fetch — so unit
 * tests can exercise PASS/FAIL without network or a real token.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.apiKey] — if a string, treated as direct EDR Bearer
 *   (tests). `null` = missing. omit = resolve METEOGATE_API_KEY then METEOALARM_API_KEY.
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {typeof fetch} [opts.fetchImpl] — defaults to global fetch
 * @param {object} [opts.log] — logger with log/error/warn (default console)
 * @returns {Promise<number>} exit code (0 = PASS, 1 = FAIL)
 */
async function runMeteoAlarmApiKeyTest({
  apiKey,
  fetchImpl = fetch,
  log = console,
  env = process.env,
} = {}) {
  const auth =
    apiKey === undefined
      ? resolveWarningsAuth(env)
      : apiKey
        ? { mode: 'meteoalarm', key: apiKey }
        : null;
  if (!auth) {
    log.error('❌ METEOGATE_API_KEY / METEOALARM_API_KEY não está definida.');
    log.error('');
    log.error('   1. Particulares: MeteoGate (https://meteogate.eu /');
    log.error('      https://devportal.meteogate.eu) — METEOGATE_API_KEY.');
    log.error('   1b. Redistribuidor aprovado: Bearer token no EDR directo');
    log.error('      (api.meteoalarm.org) — METEOALARM_API_KEY.');
    log.error('   2. Depois corre, ex.:');
    log.error('      METEOGATE_API_KEY=xxxxxxxx node scripts/test-meteoalarm-api-key.js');
    log.error('');
    log.error('   Guia completo (obtenção + secret GitHub + teste): docs/METEOALARM_API_KEY.md');
    return 1;
  }
  log.log(`   ✓ ${auth.mode === 'meteogate' ? 'METEOGATE_API_KEY' : 'METEOALARM_API_KEY'} presente (não mostra o valor)`);

  // ── 1. Locations query with the token ───────────────────────────────────
  log.log(
    auth.mode === 'meteogate'
      ? '\n[1/3] Consulta MeteoGate (locations/PT?datetime=…) com apikey...'
      : '\n[1/3] Consulta EDR (locations/PT?active=true) com Bearer token...',
  );
  let features;
  try {
    features = await fetchFeaturesPage(auth, 'PT', 1, fetchImpl);
  } catch (err) {
    log.error(`❌ Falha na consulta EDR: ${err.message}`);
    log.error('   Causas comuns: token inválido (401/403), rede, ou API em baixo.');
    return 1;
  }
  log.log(`   ✓ Token aceite — ${features.length} avisos activos para PT.`);

  // ── 2. CAP parse ────────────────────────────────────────────────────────
  log.log('\n[2/3] Parse do primeiro aviso (CAP Oasis 1.2)...');
  let parsed = 0;
  let expired = 0;
  for (const feature of features) {
    const url = capJsonUrl(feature);
    if (!url) continue;
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
      });
      if (!res.ok) continue;
      const cap = await res.json();
      const w = capToWarning(cap, feature, 'pt-PT');
      if (!w) continue;
      const expires = w.endTime ? new Date(w.endTime).getTime() : Infinity;
      if (expires < Date.now()) {
        expired += 1;
        continue;
      }
      parsed += 1;
      log.log(`   ✓ Aviso: ${w.type} (${w.level}) — ${w.areaLabel}`);
      log.log(`     text: ${(w.text || '(sem descrição)').slice(0, 120)}`);
      if (w.startTime) log.log(`     início: ${w.startTime} · fim: ${w.endTime ?? '—'}`);
      break;
    } catch {
      // try next feature
    }
  }
  if (parsed === 0) {
    log.warn(`   ⚠️ Nenhum aviso activo parseável (${features.length} features, ${expired} expirados).`);
    log.warn('   A API responde (token OK) — é só uma altura calma em PT.');
  }

  // ── 3. Payload over real spots ──────────────────────────────────────────
  log.log('\n[3/3] buildMeteoAlarmPayload sobre os spots reais...');
  const spots = parseSpotsFromFile();
  const payload = await buildMeteoAlarmPayload(auth, spots, { fetchImpl });
  const withWarnings = Object.keys(payload.spotWarnings ?? {}).length;
  log.log(`   ✓ Payload: source=${payload.source} · warnings=${payload.warnings.length} · spots afectados=${withWarnings}/${spots.length}`);
  if (payload.source !== 'meteoalarm') {
    log.error('❌ source inesperado no payload.');
    return 1;
  }

  log.log('\n✅ PASS — a key de avisos é válida e o fallback está funcional.');
  log.log('   Próximo passo: secret GitHub METEOGATE_API_KEY (docs/METEOALARM_API_KEY.md);');
  log.log('   o workflow usa-o automaticamente quando o IPMA estiver em baixo.');
  return 0;
}

async function main() {
  console.log('🔑 MeteoAlarm (EUMETNET) API token — end-to-end test\n');
  const code = await runMeteoAlarmApiKeyTest();
  process.exit(code);
}

// Só corre como CLI (`node scripts/test-meteoalarm-api-key.js`); nos testes
// importa-se o módulo e chama-se runMeteoAlarmApiKeyTest com fetch mockado.
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Erro inesperado:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  runMeteoAlarmApiKeyTest,
  parseSpotsFromFile,
};
