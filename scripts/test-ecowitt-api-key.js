/**
 * End-to-end test for the Ecowitt Cloud API v3 credentials
 * (ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY, ECOWITT_MAC).
 *
 * Validates the whole chain in one command:
 *   1. Credentials present (all three env vars — none is shown).
 *   2. GET /device/info with application_key + api_key + MAC/IMEI — the
 *      credentials are accepted and resolve the station.
 *   3. GET /device/real_time — a live wind reading exists and is FRESH
 *      (≤ MAX_OBS_AGE_MS), which is exactly what the observed layer uses.
 *
 * Usage:
 *   ECOWITT_APPLICATION_KEY=... ECOWITT_API_KEY=... ECOWITT_MAC=... \
 *     node scripts/test-ecowitt-api-key.js
 *
 * Exit codes:
 *   0  — credentials valid and the station is serving fresh data.
 *   1  — credentials missing/invalid, or no fresh reading (see output).
 *
 * The chain logic lives in `runEcowittApiKeyTest()` (exported, testable with
 * a mocked fetch); the CLI wrapper maps its exit code to process.exit.
 */

const {
  getEcowittCredentials,
  fetchEcowittSnapshot,
  ECOWITT_API,
} = require('./lib/ecowitt.js');

/**
 * The full credential-diagnosis chain. Returns the exit code (0 PASS / 1 FAIL)
 * instead of calling process.exit, and accepts a mocked fetch — so unit
 * tests can exercise PASS/FAIL without network or real credentials.
 *
 * @param {object} [opts]
 * @param {{ application_key: string, api_key: string, mac: string } | null} [opts.creds]
 *   — defaults to getEcowittCredentials() (reads process.env)
 * @param {typeof fetch} [opts.fetchImpl] — defaults to global fetch
 * @param {object} [opts.log] — logger with log/error/warn (default console)
 * @returns {Promise<number>} exit code (0 = PASS, 1 = FAIL)
 */
async function runEcowittApiKeyTest({
  creds = getEcowittCredentials(),
  fetchImpl = fetch,
  log = console,
} = {}) {
  if (!creds) {
    log.error('❌ ECOWITT_* não estão definidas (ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY, ECOWITT_MAC).');
    log.error('');
    log.error('   1. Regista-te gratuitamente em https://www.ecowitt.net (conta do observador).');
    log.error('      Na conta: OpenAPI → Application Key + API Key; o MAC/IMEI é o da estação PWS.');
    log.error('   2. Depois corre, ex.:');
    log.error(
      '      ECOWITT_APPLICATION_KEY=xxx ECOWITT_API_KEY=yyy ECOWITT_MAC=zzz node scripts/test-ecowitt-api-key.js',
    );
    log.error('');
    log.error('   A estação é opcional: sem ela, o merge simplesmente usa IPMA/METAR como vento observado.');
    return 1;
  }
  log.log('   ✓ ECOWITT_* presentes (não mostra os valores)');

  // ── 1+2. device/info + device/real_time com as credenciais ─────────────
  log.log('\n[1/2] device/info + device/real_time (credenciais + MAC/IMEI)...');
  let snapshot;
  try {
    snapshot = await fetchEcowittSnapshot({ fetchImpl, creds });
  } catch (err) {
    log.error(`❌ Falha na consulta Ecowitt: ${err.message}`);
    log.error('   Causas comuns: application_key/api_key inválidas (code ≠ 0), MAC/IMEI errado,');
    log.error('   ou a API em baixo. Confirma as chaves na consola OpenAPI da Ecowitt.');
    return 1;
  }
  if (!snapshot) {
    log.error('❌ fetchEcowittSnapshot devolveu null (credenciais ausentes?).');
    return 1;
  }

  // ── 3. Frescura ─────────────────────────────────────────────────────────
  // fetchEcowittSnapshot já lança quando a leitura é mais antiga que
  // MAX_OBS_AGE_MS — chegar aqui significa dados frescos + estação válida.
  log.log(`   ✓ Estação: ${snapshot.stationName} (${snapshot.lat.toFixed(3)}, ${snapshot.lon.toFixed(3)})`);
  log.log(`   ✓ Vento: ${snapshot.windSpeedMs.toFixed(1)} m/s ${snapshot.windCardinal} (${snapshot.windDirDeg}°)`);
  if (snapshot.tempC != null) log.log(`   ✓ Temperatura: ${snapshot.tempC.toFixed(1)}°C`);
  log.log(`   ✓ Leitura fresca (≤3h) — observada às ${snapshot.observedAt}`);

  log.log('\n✅ PASS — as credenciais Ecowitt são válidas e a estação está a servir dados frescos.');
  log.log('   O workflow usa-as automaticamente para o vento observado (merge-observations).');
  return 0;
}

async function main() {
  console.log('🔑 Ecowitt Cloud API v3 — credential test\n');
  const code = await runEcowittApiKeyTest();
  process.exit(code);
}

// Só corre como CLI (`node scripts/test-ecowitt-api-key.js`); nos testes
// importa-se o módulo e chama-se runEcowittApiKeyTest com fetch mockado.
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Erro inesperado:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  runEcowittApiKeyTest,
  ECOWITT_API,
};
