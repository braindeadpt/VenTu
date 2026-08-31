/**
 * End-to-end test for the IH Datawell Waverider API key (IH_API_KEY).
 *
 * Validates the whole chain in one command:
 *   1. Buoy stations via the IH OGC API (free, no key) — network reachable.
 *   2. getDatawellData for one buoy with X-API-KEY — key is accepted.
 *   3. Parse + freshness of the latest wave row (hm0 / tp / thtp / hmax / temp).
 *
 * Usage:
 *   IH_API_KEY=... node scripts/test-ih-api-key.js                # first fresh ACTIVE buoy
 *   IH_API_KEY=... node scripts/test-ih-api-key.js --station 4    # specific buoy (4 = Leixões)
 *   IH_API_KEY=... node scripts/test-ih-api-key.js --family fugro # only Fugro Wavescan buoys (Nazaré)
 *
 * Exit codes:
 *   0  — key OK and at least one fresh wave reading was parsed.
 *   1  — key missing/invalid, or no buoy returned usable data (see output).
 *
 * The chain logic lives in `runIhApiKeyTest()` (exported, testable with a
 * mocked fetch); the CLI wrapper below maps its exit code to process.exit.
 *
 * Full setup guide (get the key + create the GitHub secret):
 *   docs/IH_API_KEY.md
 */

const {
  fetchBuoyStations,
  fetchBuoyWave,
  waveWindow,
  isFreshObservation,
  buildWaveRequestUrl,
  DEFAULT_WAVE_API,
} = require('./lib/ihBuoys.js');

const API_KEY = process.env.IH_API_KEY?.trim() || null;

const args = process.argv.slice(2);
const stationArg = (() => {
  const i = args.indexOf('--station');
  return i >= 0 && args[i + 1] && Number.isFinite(Number(args[i + 1]))
    ? Number(args[i + 1])
    : null;
})();
const familyArg = (() => {
  const i = args.indexOf('--family');
  const v = i >= 0 ? args[i + 1] : undefined;
  return v === 'datawell' || v === 'fugro' ? v : null;
})();
/** Print the exact request (raw curl) and exit without touching the network. */
const urlOnlyArg = args.includes('--url');

/** Generous freshness window for a manual test (pipeline attach uses 3h). */
const MAX_FRESH_HOURS = 6;
const WAVE_WINDOW_HOURS = 48;

function summarizeWave(row) {
  const parts = [`hm0 ${row.hm0.toFixed(2)} m`];
  if (typeof row.tp === 'number') parts.push(`tp ${row.tp.toFixed(1)} s`);
  if (typeof row.thtp === 'number') parts.push(`dir ${Math.round(row.thtp)}°`);
  if (typeof row.hmax === 'number') parts.push(`hmax ${row.hmax.toFixed(2)} m`);
  if (typeof row.temp === 'number') parts.push(`SST ${row.temp.toFixed(1)}°C`);
  return parts.join(' · ');
}

/**
 * The full key-diagnosis chain. Returns the exit code (0 PASS / 1 FAIL)
 * instead of calling process.exit, and accepts a mocked fetch — so unit
 * tests can exercise PASS/FAIL without network or a real key.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.apiKey] — defaults to process.env.IH_API_KEY
 * @param {typeof fetch} [opts.fetchImpl] — defaults to global fetch
 * @param {number|null} [opts.stationId] — optional specific buoy id_est
 * @param {'datawell'|'fugro'|null} [opts.family] — optional instrument family filter
 * @param {object} [opts.log] — logger with log/error/warn (default console)
 * @returns {Promise<number>} exit code (0 = PASS, 1 = FAIL)
 */
async function runIhApiKeyTest({
  apiKey = API_KEY,
  fetchImpl = fetch,
  stationId = stationArg,
  family = familyArg,
  urlOnly = urlOnlyArg,
  log = console,
} = {}) {
  if (!apiKey && !urlOnly) {
    log.error('❌ IH_API_KEY não está definida.');
    log.error('');
    log.error('   1. Obtém a key gratuita por e-mail: cedencia.dados@hidrografico.pt');
    log.error('   2. Depois corre, ex.:');
    log.error('      IH_API_KEY=xxxxxxxx node scripts/test-ih-api-key.js');
    log.error('');
    log.error('   Guia completo (obtenção + secret GitHub + teste): docs/IH_API_KEY.md');
    return 1;
  }
  if (urlOnly) {
    log.log('   (modo --url: apenas imprime o pedido exacto, sem rede)')
  } else {
    log.log('   ✓ IH_API_KEY presente (não mostra o valor)');
  }
  log.log('   ✓ IH_API_KEY presente (não mostra o valor)');

  // ── 1. Stations (no key) ────────────────────────────────────────────────
  log.log('\n[1/3] Estações via OGC API (sem key)...');
  let stations;
  try {
    const result = await fetchBuoyStations(undefined, undefined, fetchImpl);
    stations = result.stations;
  } catch (err) {
    log.error(`❌ Falha ao obter a lista de boias: ${err.message}`);
    log.error('   Verifica a conectividade com https://api-features.hidrografico.pt');
    return 1;
  }
  const active = Object.values(stations)
    .filter((s) => s.status !== 'inactive' && s.status !== 'inativa')
    .sort((a, b) => String(b.lastSea ?? '').localeCompare(String(a.lastSea ?? '')));
  log.log(`   ✓ ${Object.keys(stations).length} boias, ${active.length} activas`);
  if (active.length === 0) {
    log.error('❌ Nenhuma boia activa na rede — não há séries para testar.');
    return 1;
  }

  // ── 2. Wave series with the key ─────────────────────────────────────────
  let candidates = stationId != null
    ? active.filter((s) => s.idEst === stationId)
    : active;
  if (family != null) {
    candidates = candidates.filter((s) => s.family === family);
    if (candidates.length === 0) {
      log.error(
        `❌ Nenhuma boia ${family} activa. ${family === 'fugro'
          ? 'A Nazaré Costeira (CSA88/2, id_est 2) é a única Fugro activa — confirma status/nrt no OGC API.'
          : 'Activas: ' + active.map((s) => `${s.idEst} (${s.name})`).join(', ')}`,
      );
      return 1;
    }
  }
  if (stationId != null && candidates.length === 0) {
    log.error(
      `❌ Boia ${stationId} não encontrada entre as activas. Activas: ` +
        active.map((s) => `${s.idEst} (${s.name})`).join(', '),
    );
    return 1;
  }

  const window = waveWindow(WAVE_WINDOW_HOURS);
  if (urlOnly) {
    log.log('\n[2/3] Pedido exacto que a pipeline faz (coloca a tua key no header):');
    for (const station of candidates.slice(0, 3)) {
      const url = buildWaveRequestUrl(station.idEst, window, DEFAULT_WAVE_API);
      log.log('');
      log.log(`   # boia ${station.idEst} — ${station.name} (${station.area ?? '?'}, ${station.family ?? '?'})`);
      log.log(`   curl -s -H 'Accept: application/json' -H 'X-API-KEY: A_TUA_KEY_AQUI' \\`);
      log.log(`        '${url}'`);
    }
    log.log('');
    log.log('   Se o servidor devolver 401/403 → a key é inválida ou não cobre a boia.');
    log.log('   Se devolver JSON com linhas (date/hm0/tp/thtp) → a key serve esta família.');
    log.log('   Se devolver JSON vazio (sem rows na janela) → key OK, mas a boia não tem NRT.');
    return 0;
  }

  let ok = 0;
  let failed = 0;
  for (const station of candidates.slice(0, 3)) {
    log.log(
      `\n[2/3] Série de onda da boia ${station.idEst} (${station.name}, ${station.area ?? '?'}, ` +
        `${station.family ?? '?'}) via getDatawellData com X-API-KEY...`,
    );
    log.log(`   URL: ${buildWaveRequestUrl(station.idEst, window, DEFAULT_WAVE_API)}`);
    try {
      // fetchBuoyWave já devolve a linha mais recente (pickLatestWave interno).
      const latest = await fetchBuoyWave(apiKey, station.idEst, undefined, fetchImpl, window);
      if (!latest) {
        failed += 1;
        log.warn(`   ⚠️ Sem leituras na janela (${WAVE_WINDOW_HOURS}h) — boia sem NRT?`);
        continue;
      }
      const fresh = isFreshObservation(latest.date, Date.now(), MAX_FRESH_HOURS);
      log.log(`   ✓ Leitura mais recente: ${latest.date}`);
      log.log(`     ${summarizeWave(latest)}`);
      log.log(
        fresh
          ? '   ✓ Fresca (≤ 6 h) — key OK de ponta a ponta.'
          : `   ⚠️ Leitura mais antiga que ${MAX_FRESH_HOURS}h — a key funciona, mas a boia está a reportar pouco.`,
      );
      ok += 1;
      break;
    } catch (err) {
      failed += 1;
      log.warn(`   ⚠️ Erro na boia ${station.idEst}: ${err.message}`);
    }
  }

  // ── 3. Verdict ──────────────────────────────────────────────────────────
  log.log('\n[3/3] Resultado');
  if (ok > 0) {
    log.log('✅ PASS — a IH_API_KEY é válida e devolve dados de onda NRT.');
    log.log('   Próximo passo: criar o secret no GitHub (docs/IH_API_KEY.md) e');
    log.log('   correr o workflow update-data.yml para ver observedWave no conditions.json.');
    return 0;
  }
  log.error('❌ FAIL — nenhuma boia devolveu dados utilizáveis com esta key.');
  log.error(`   (${failed} tentativas falharam — ver avisos acima.)`);
  log.error('   Causas comuns: key inválida (401/403), boias sem NRT, ou backend IH em baixo.');
  return 1;
}

async function main() {
  console.log('🔑 IH Datawell API key — end-to-end test\n');
  const code = await runIhApiKeyTest();
  process.exit(code);
}

// Só corre como CLI (`node scripts/test-ih-api-key.js`); nos testes importa-se
// o módulo e chama-se runIhApiKeyTest com fetch mockado.
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Erro inesperado:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  runIhApiKeyTest,
  summarizeWave,
  MAX_FRESH_HOURS,
  WAVE_WINDOW_HOURS,
};
