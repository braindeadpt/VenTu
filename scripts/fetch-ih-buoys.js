/**
 * Fetch IH Datawell Waverider buoys and bake `public/data/ih-buoys.json`.
 *
 * - Stations list comes from the IH OGC API (free, no key) — always fetched.
 * - Wave time series (`getDatawellData`, hm0/tp/thtp/hmax/temp) is fetched
 *   per ACTIVE buoy only when IH_API_KEY is set (free key, X-API-KEY header).
 *
 * IH outages must NOT brick the Open-Meteo pipeline: on failure we keep the
 * previous ih-buoys.json (if any) and exit 0, exactly like fetch-ih-tides.js.
 * Without the key the file still carries station positions + last_sea/last_pos
 * timestamps, just no `latest` wave snapshot — merge-observations then skips
 * the observedWave layer (no fake readings).
 *
 * IH WAVE API OUTAGE (incident 2026-10-23: HTTP 500 on getDatawellData for
 * every Datawell buoy while the keyless station list and the tide gauges kept
 * working): when EVERY per-buoy wave request fails with a transient error
 * (5xx, 408/429, timeout, network), the run is classified 'upstream-outage'
 * (classifyWaveFetch in lib/ihBuoys.js). We then write the fresh station
 * catalogue with the PREVIOUS `latest` snapshots carried forward — each with
 * its REAL observation time, so every freshness gate downstream (observedWave
 * 3 h, map dots, layer health → 'stale') treats them as old readings — plus a
 * `waveFetchStatus: 'upstream-outage'` / `upstreamOutage` block, log a
 * `::warning::` and exit 0. verify-ih-buoy-layer.js reads that flag and warns
 * instead of failing, so the rest of the pipeline (commit/deploy) runs. A
 * prolonged outage (≥ IH_OUTAGE_ALERT_HOURS, default 3 h) sends ONE Telegram
 * alert and one on recovery (state carried in the committed file).
 * Still FAIL: 401/403 (below), zero buoys listed, and a key whose requests all
 * come back 2xx without series ('empty' — verify step fails on it).
 *
 * EXCEPTION — key rejected (HTTP 401/403): a bad/expired IH_API_KEY fails
 * EVERY buoy request, so silently writing hasWaveData:false would hide the
 * problem forever. In that case we fail FAST: write the file with
 * `apiKeyStatus: 'unauthorized'` (UI diagnostic), log a `::error::` GitHub
 * annotation, send a Telegram alert (transition-gated: only when the previous
 * run was NOT already unauthorized) and exit 1 — the workflow stops at this
 * step instead of publishing data without the observed layer.
 */

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const {
  fetchBuoyStations,
  fetchBuoyWave,
  waveWindow,
  mapSpotsToBuoys,
  isIhAuthError,
  classifyWaveFetch,
  carryForwardWaveReadings,
  DEFAULT_IH_API,
  DEFAULT_WAVE_API,
  DEFAULT_COLLECTIONS,
} = require('./lib/ihBuoys.js');

const IH_API = process.env.IH_API_URL || DEFAULT_IH_API;
const WAVE_API = process.env.IH_BUOY_WAVE_API_URL || DEFAULT_WAVE_API;
const API_KEY = process.env.IH_API_KEY?.trim() || null;
const COLLECTIONS = (process.env.IH_BUOY_COLLECTIONS || DEFAULT_COLLECTIONS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUTPUT_PATH =
  process.env.IH_BUOY_OUTPUT_PATH || path.join(__dirname, '../public/data/ih-buoys.json');
/** Max age of a reused ih-buoys.json before the pipeline logs it loudly. */
const MAX_STALE_HOURS = 24;
/** Duração (h) de um outage IH contínuo a partir da qual sai UM alerta Telegram. */
const DEFAULT_OUTAGE_ALERT_HOURS = 3;
/** Máximo de falhas por boia gravadas no bloco upstreamOutage (diagnóstico). */
const MAX_RECORDED_FAILURES = 20;

function outageAlertHours() {
  const v = Number(process.env.IH_OUTAGE_ALERT_HOURS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_OUTAGE_ALERT_HOURS;
}

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

function readPreviousFile() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function previousFileAgeHours() {
  const data = readPreviousFile();
  const t = data && data.fetchedAt ? new Date(data.fetchedAt).getTime() : NaN;
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

/**
 * Fetch wave snapshots for every active buoy (11 requests max, allSettled so
 * one dead buoy never fails the run). Returns the map idEst → latest snapshot
 * plus the run classification (classifyWaveFetch: ok | partial |
 * upstream-outage | empty | error | no-active | no-key). Throws the typed
 * IhAuthError when any request is rejected with 401/403.
 * @returns {Promise<{ snapshots: Record<string, object>, classification: ReturnType<typeof classifyWaveFetch> }>}
 */
async function fetchWaveSnapshots(stations) {
  if (!API_KEY) {
    return { snapshots: {}, classification: classifyWaveFetch([], { apiKeyConfigured: false }) };
  }
  const active = Object.values(stations).filter(
    (s) => s.status !== 'inactive' && s.status !== 'inativa',
  );
  const window = waveWindow();
  const results = await Promise.allSettled(
    active.map((s) => fetchBuoyWave(API_KEY, s.idEst, WAVE_API, fetch, window)),
  );
  // A key rejeitada falha TODAS as boias (401/403) — nunca é uma avaria de uma
  // boia. Propagar como erro tipado: o run() falha cedo com alerta em vez de
  // escrever hasWaveData:false em silêncio.
  for (const r of results) {
    if (r.status === 'rejected' && isIhAuthError(r.reason)) throw r.reason;
  }
  const snapshots = {};
  active.forEach((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      snapshots[s.idEst] = r.value;
    } else if (r.status === 'rejected') {
      console.warn(`  ⚠️ buoy ${s.idEst} (${s.name}): ${r.reason?.message ?? r.reason}`);
    }
  });
  const classification = classifyWaveFetch(
    active.map((s, i) => ({ idEst: s.idEst, result: results[i] })),
    { apiKeyConfigured: true },
  );
  console.log(
    `   Wave snapshots: ${classification.ok} ok, ${classification.active - classification.ok} failed ` +
      `(of ${classification.active} active buoys) — ${classification.status}`,
  );
  return { snapshots, classification };
}

/**
 * Pure: build the ih-buoys.json payload for an IH upstream outage.
 * - `stations` (fresh catalogue) or, when the listing itself is down, the
 *   previous catalogue — with the previous `latest` readings carried forward
 *   (real observation times kept; > 24 h dropped).
 * - `hasWaveData` true only while carried readings exist (layer health then
 *   derives 'stale', never 'ok'); `waveFetchStatus: 'upstream-outage'`.
 * - `upstreamOutage.since` survives across runs (first outage run), as does
 *   `alertedAt` (Telegram transition gate) and `lastWaveOkAt` (last run that
 *   really got wave data).
 * @param {{ prev: object | null, stations?: Record<string, object> | null,
 *           spotMapping?: object | null, sourceCollections?: string[] | null,
 *           failures?: Array<object>, scope: 'wave' | 'stations', nowMs?: number }} args
 */
function buildOutagePayload({ prev, stations, spotMapping, sourceCollections, failures = [], scope, nowMs = Date.now() }) {
  const nowIso = new Date(nowMs).toISOString();
  const baseStations = stations ?? prev?.stations ?? {};
  const carried = carryForwardWaveReadings(baseStations, prev, { nowMs });
  const prevOutage = prev?.upstreamOutage && prev?.waveFetchStatus === 'upstream-outage' ? prev.upstreamOutage : null;
  const lastWaveOkAt = prevOutage
    ? prevOutage.lastWaveOkAt ?? null
    : prev?.hasWaveData === true && typeof prev.fetchedAt === 'string'
      ? prev.fetchedAt
      : null;
  const prevFetchedOk = typeof prev?.fetchedAt === 'string' && Number.isFinite(new Date(prev.fetchedAt).getTime());
  return {
    stations: carried.stations,
    spotMapping: spotMapping ?? prev?.spotMapping ?? {},
    // Catálogo fresco (scope 'wave') → agora; catálogo anterior (scope
    // 'stations', listagem em baixo) → mantém o fetchedAt anterior (TTL honesto).
    fetchedAt: scope === 'stations' && prevFetchedOk ? prev.fetchedAt : nowIso,
    sourceCollections: sourceCollections ?? prev?.sourceCollections ?? [],
    apiKeyConfigured: API_KEY != null,
    hasWaveData: carried.kept > 0,
    waveFetchStatus: 'upstream-outage',
    upstreamOutage: {
      scope,
      since: prevOutage?.since ?? nowIso,
      lastAttemptAt: nowIso,
      lastWaveOkAt,
      keptReadings: carried.kept,
      newestKeptReadingAt: carried.newestKeptReadingAt,
      failures: failures.slice(0, MAX_RECORDED_FAILURES),
      ...(prevOutage?.alertedAt ? { alertedAt: prevOutage.alertedAt } : {}),
    },
  };
}

function writeOutput(output) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  atomicWriteJson(OUTPUT_PATH, output);
}

function outageWarningLine(output) {
  const o = output.upstreamOutage;
  const failed = o.failures.length;
  const codes = [...new Set(o.failures.map((f) => (f.status != null ? `HTTP ${f.status}` : f.error)))].join(', ');
  const kept = o.keptReadings > 0
    ? `${o.keptReadings} leituras anteriores mantidas (mais recente ${o.newestKeptReadingAt}, NÃO frescas — o observedWave só usa leituras ≤ 3 h; fallback WMO/Copernicus)`
    : 'sem leituras anteriores ≤ 24 h para manter (hasWaveData=false; fallback WMO/Copernicus)';
  const what = o.scope === 'stations' ? 'listagem de boias (OGC)' : `getDatawellData em ${failed}/${failed} boias`;
  return `IH em baixo a montante (${what}: ${codes || 'erro transitório'}) desde ${o.since} — ${kept}. O job continua.`;
}

async function fetchIHBuoys() {
  console.log('🌊 IH OGC API - Fetching Datawell Waverider buoys...\n');

  if (!API_KEY) {
    console.log('   ℹ️ IH_API_KEY not set — stations only, no wave time series (observedWave skipped).');
  }

  const { stations, sourceCollections } = await fetchBuoyStations(IH_API, COLLECTIONS);
  console.log(`📍 Found ${Object.keys(stations).length} buoys (${sourceCollections.join(', ')})`);

  let snapshots;
  let classification;
  try {
    ({ snapshots, classification } = await fetchWaveSnapshots(stations));
  } catch (err) {
    if (isIhAuthError(err)) {
      // Key rejeitada: gravar o ficheiro com o marcador de diagnóstico e falhar.
      const prev = readPreviousFile();
      err.previouslyUnauthorized = prev?.apiKeyStatus === 'unauthorized';
      const spots = parseSpotsFromFile();
      const spotMapping = mapSpotsToBuoys(spots, stations);
      writeOutput({
        stations,
        spotMapping,
        fetchedAt: new Date().toISOString(),
        sourceCollections,
        apiKeyConfigured: API_KEY != null,
        hasWaveData: false,
        waveFetchStatus: 'auth',
        apiKeyStatus: 'unauthorized',
        authError: { status: err.status, at: new Date().toISOString() },
      });
      console.error(`🔴 IH_API_KEY rejeitada (HTTP ${err.status}) — sem séries de onda; ficheiro marcado apiKeyStatus:'unauthorized'.`);
      throw err;
    }
    throw err;
  }

  const spots = parseSpotsFromFile();
  const spotMapping = mapSpotsToBuoys(spots, stations);
  console.log(`🗺️  Mapped ${Object.keys(spotMapping).length} spots to nearest buoy`);

  const prev = readPreviousFile();

  if (classification.status === 'upstream-outage') {
    // Todas as boias falharam com 5xx/timeout/rede: avaria do IH, não nossa.
    // Mantém as leituras anteriores (com a hora real) e marca o outage.
    const output = buildOutagePayload({
      prev,
      stations,
      spotMapping,
      sourceCollections,
      failures: classification.failures,
      scope: 'wave',
    });
    await maybeNotifyIhOutage(output, prev);
    writeOutput(output);
    console.warn(`::warning::${outageWarningLine(output)}`);
    console.log(`✅ IH buoy data saved to ${path.relative(process.cwd(), OUTPUT_PATH)} (upstream-outage)`);
    return output;
  }

  for (const [idEst, latest] of Object.entries(snapshots)) {
    if (stations[idEst]) stations[idEst].latest = latest;
  }

  const output = {
    stations,
    spotMapping,
    fetchedAt: new Date().toISOString(),
    sourceCollections,
    apiKeyConfigured: API_KEY != null,
    hasWaveData: API_KEY != null && Object.keys(snapshots).length > 0,
    waveFetchStatus: classification.status,
  };
  if (classification.fail) {
    // 'empty' (2xx sem séries), 'error' ou 'no-active': o verify-ih-buoy-layer
    // falha o job (hasWaveData=false sem flag de outage) — gravar o porquê.
    output.waveFetchFailures = classification.failures.slice(0, MAX_RECORDED_FAILURES);
    console.error(
      `🔴 IH wave fetch '${classification.status}' — ${classification.ok}/${classification.active} boias com série ` +
        `(${classification.empty} 2xx sem série, ${classification.transient} transitórias, ${classification.other} outras).`,
    );
  }
  await maybeNotifyIhRecovery(output, prev);
  writeOutput(output);

  console.log(`✅ IH buoy data saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`📊 Buoys: ${Object.keys(stations).length} · Mapped spots: ${Object.keys(spotMapping).length} · Wave data: ${output.hasWaveData ? 'yes' : 'no'}`);
  return output;
}

/**
 * Envia uma mensagem Telegram ops (dry-run sem OPS_TELEGRAM_CHAT_ID). Nunca
 * lança: um Telegram em baixo não pode travar a pipeline de dados.
 * @returns {Promise<boolean>} true quando a mensagem foi enviada
 */
async function sendOpsTelegram(text, opts = {}) {
  const log = opts.log ?? ((m) => console.log(m));
  const chatId = opts.chatId ?? process.env.OPS_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    log('  ⚠️ OPS_TELEGRAM_CHAT_ID não definido (dry-run, sem alerta Telegram).');
    return false;
  }
  try {
    const send = opts.send ?? require('./lib/telegram').sendTelegramMessage;
    await send(chatId, text);
    return true;
  } catch (err) {
    console.warn(`  ⚠️ Telegram falhou (${err?.message ?? err}) — tenta-se de novo no próximo run.`);
    return false;
  }
}

/**
 * Alerta Telegram de outage IH PROLONGADO — gated por transição: UM alerta
 * quando a camada está sem leituras IH novas há IH_OUTAGE_ALERT_HOURS (3 h por
 * omissão, contadas desde lastWaveOkAt ou since, o mais antigo);
 * `upstreamOutage.alertedAt` (gravado no ficheiro committed) impede repetições.
 * Muta `output.upstreamOutage.alertedAt` quando envia.
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
async function maybeNotifyIhOutage(output, prev, opts = {}) {
  const o = output?.upstreamOutage;
  if (!o) return { notified: false, reason: 'no-outage' };
  if (o.alertedAt) return { notified: false, reason: 'already-reported' };
  const nowMs = opts.nowMs ?? Date.now();
  // Duração = desde a última leitura IH boa conhecida (lastWaveOkAt) ou, sem
  // ela, desde o primeiro run em outage — o que for mais antigo.
  const startMs = Math.min(
    ...[o.since, o.lastWaveOkAt].map((x) => new Date(x ?? NaN).getTime()).filter(Number.isFinite),
  );
  const hours = (nowMs - startMs) / 3_600_000;
  const threshold = opts.alertHours ?? outageAlertHours();
  if (!Number.isFinite(hours) || hours < threshold) return { notified: false, reason: 'below-threshold' };
  const codes = [...new Set(o.failures.map((f) => (f.status != null ? `HTTP ${f.status}` : f.error)))].join(', ');
  const text =
    `⚠️ VenTu — API de boias IH em baixo há ${hours.toFixed(1)} h (${codes || 'erro transitório'}` +
    `${o.scope === 'stations' ? ' na listagem de boias' : ` em ${o.failures.length} boias`}).\n` +
    `A pipeline continua: as leituras IH anteriores ficam marcadas como antigas (não frescas) e o observedWave usa a fallback WMO/Copernicus.\n` +
    `Nada a fazer do nosso lado se a key estiver bem (401/403 falham à parte). Aviso único — avisa de novo na recuperação.`;
  const sent = await sendOpsTelegram(text, opts);
  if (!sent) return { notified: false, reason: 'not-sent' };
  o.alertedAt = new Date(nowMs).toISOString();
  return { notified: true };
}

/**
 * Recuperação: só avisa quando o run anterior estava em outage E esse outage
 * chegou a ser alertado (transição alertado → recuperado).
 */
async function maybeNotifyIhRecovery(output, prev, opts = {}) {
  const prevOutage = prev?.waveFetchStatus === 'upstream-outage' ? prev?.upstreamOutage : null;
  if (!prevOutage?.alertedAt) return { notified: false, reason: 'no-alerted-outage' };
  if (output?.hasWaveData !== true) return { notified: false, reason: 'not-recovered' };
  const nowMs = opts.nowMs ?? Date.now();
  const hours = (nowMs - new Date(prevOutage.since).getTime()) / 3_600_000;
  const text =
    `✅ VenTu — API de boias IH recuperou (${output.waveFetchStatus}) depois de ~${Number.isFinite(hours) ? hours.toFixed(1) : '?'} h em baixo. ` +
    `Leituras frescas de novo na camada observedWave.`;
  const sent = await sendOpsTelegram(text, opts);
  return sent ? { notified: true } : { notified: false, reason: 'not-sent' };
}

/**
 * Alerta Telegram (opt-in via OPS_TELEGRAM_CHAT_ID) quando a key IH passa a
 * ser rejeitada. Gated por transição: só avisa quando o run anterior NÃO já
 * estava `unauthorized` — uma key má alerta uma vez, não a cada run horário.
 * @param {object} err IhAuthError (com `previouslyUnauthorized`)
 * @param {{ send?: (chatId: string, text: string) => Promise<boolean>, chatId?: string, log?: (m: string) => void, layer?: string }} [opts]
 *   `layer` — frase capitalizada que nomeia a camada afectada na mensagem
 *   (ex. 'A camada observedWave' · 'O viés de onda (wave-bias)').
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
async function notifyIhAuthFailure(err, opts = {}) {
  const log = opts.log ?? ((m) => console.log(m));
  if (err.previouslyUnauthorized) {
    return { notified: false, reason: 'already-reported' };
  }
  const status = err.status ?? 'HTTP';
  const layer = opts.layer ?? 'A camada observedWave';
  const text =
    `🚨 VenTu — IH_API_KEY rejeitada (HTTP ${status}) pelo getDatawellData.\n` +
    `${layer} ficou sem leituras das boias IH e o workflow falhou cedo para não arrastar uma key morta pela pipeline.\n` +
    `Renova a key (cedencia.dados@hidrografico.pt) e actualiza o secret em Settings → Secrets → Actions. Guia: docs/IH_API_KEY.md`;

  const chatId = opts.chatId ?? process.env.OPS_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    log(`  ⚠️ IH_API_KEY rejeitada — OPS_TELEGRAM_CHAT_ID não definido (dry-run, sem alerta Telegram).`);
    return { notified: false, reason: 'no-chat-id' };
  }

  const send = opts.send ?? require('./lib/telegram').sendTelegramMessage;
  await send(chatId, text);
  return { notified: true };
}

async function run() {
  try {
    await fetchIHBuoys();
  } catch (err) {
    if (isIhAuthError(err)) {
      // Fail-early: a key está má — o workflow pára neste passo (com alerta),
      // em vez de continuar com observedWave ausente silenciosamente.
      const res = await notifyIhAuthFailure(err);
      if (res.notified) console.log('   Telegram: alerta enviado.');
      console.error(
        `::error::IH_API_KEY rejeitada (HTTP ${err.status ?? '?'}) — observedWave desactivado. ` +
          `O workflow falhou cedo de propósito; renova a key (docs/IH_API_KEY.md).`,
      );
      process.exitCode = 1;
      return;
    }
    if (err?.code === 'IH_NO_BUOYS') {
      // Zero boias listadas (2xx sem estações, 404, payload sem features):
      // acionável — nunca é um outage transitório. Falha o passo.
      console.error(`::error::IH buoy listing: zero boias listadas — ${err.message}. O ih-buoys.json anterior fica intacto.`);
      process.exitCode = 1;
      return;
    }
    console.error('❌ IH buoy fetch failed:', err.message || err);
    if (err?.code === 'IH_UPSTREAM_OUTAGE' && API_KEY) {
      // Listagem OGC em baixo (5xx/timeout/rede) com key: reescrever o ficheiro
      // anterior com a flag de outage (leituras com a hora real; > 24 h fora),
      // para o verify avisar em vez de aceitar leituras velhas como frescas.
      const prev = readPreviousFile();
      const output = buildOutagePayload({
        prev,
        stations: null,
        spotMapping: null,
        sourceCollections: null,
        failures: [{ idEst: 'stations', error: String(err.message).slice(0, 200), transient: true }],
        scope: 'stations',
      });
      await maybeNotifyIhOutage(output, prev);
      writeOutput(output);
      console.warn(`::warning::${outageWarningLine(output)}`);
      return;
    }
    if (fs.existsSync(OUTPUT_PATH)) {
      const age = previousFileAgeHours();
      if (age === null) {
        console.warn('⚠️ Previous ih-buoys.json has unknown age — keeping it; pipeline continues.');
      } else if (age > MAX_STALE_HOURS) {
        console.warn(`⚠️ Previous ih-buoys.json is ${age.toFixed(1)}h old (> ${MAX_STALE_HOURS}h) — IH still down; keeping stale file so Open-Meteo/obs are not blocked.`);
      } else {
        console.warn('⚠️ Keeping previous public/data/ih-buoys.json — pipeline continues.');
      }
      return;
    }
    console.warn('⚠️ No previous ih-buoys.json — continuing without IH observed waves.');
  }
}

// Só corre como CLI (`node scripts/fetch-ih-buoys.js`); nos testes importa-se
// o módulo e chama-se fetchIHBuoys/run diretamente.
if (require.main === module) {
  run();
}

module.exports = {
  fetchIHBuoys,
  run,
  parseSpotsFromFile,
  fetchWaveSnapshots,
  notifyIhAuthFailure,
  maybeNotifyIhOutage,
  maybeNotifyIhRecovery,
  buildOutagePayload,
  readPreviousFile,
  IH_API,
  COLLECTIONS,
};
