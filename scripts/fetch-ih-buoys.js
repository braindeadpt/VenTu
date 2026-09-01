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
const {
  fetchBuoyStations,
  fetchBuoyWave,
  waveWindow,
  mapSpotsToBuoys,
  isIhAuthError,
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
 * one dead buoy never fails the run). Returns a map idEst → latest snapshot.
 */
async function fetchWaveSnapshots(stations) {
  if (!API_KEY) return {};
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
  let ok = 0;
  let failed = 0;
  active.forEach((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      snapshots[s.idEst] = r.value;
      ok += 1;
    } else {
      failed += 1;
      if (r.status === 'rejected') {
        console.warn(`  ⚠️ buoy ${s.idEst} (${s.name}): ${r.reason?.message ?? r.reason}`);
      }
    }
  });
  console.log(`   Wave snapshots: ${ok} ok, ${failed} failed (of ${active.length} active buoys)`);
  return snapshots;
}

async function fetchIHBuoys() {
  console.log('🌊 IH OGC API - Fetching Datawell Waverider buoys...\n');

  if (!API_KEY) {
    console.log('   ℹ️ IH_API_KEY not set — stations only, no wave time series (observedWave skipped).');
  }

  const { stations, sourceCollections } = await fetchBuoyStations(IH_API, COLLECTIONS);
  console.log(`📍 Found ${Object.keys(stations).length} buoys (${sourceCollections.join(', ')})`);

  let snapshots;
  try {
    snapshots = await fetchWaveSnapshots(stations);
  } catch (err) {
    if (isIhAuthError(err)) {
      // Key rejeitada: gravar o ficheiro com o marcador de diagnóstico e falhar.
      const prev = readPreviousFile();
      err.previouslyUnauthorized = prev?.apiKeyStatus === 'unauthorized';
      const spots = parseSpotsFromFile();
      const spotMapping = mapSpotsToBuoys(spots, stations);
      const outputDir = path.dirname(OUTPUT_PATH);
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(
          {
            stations,
            spotMapping,
            fetchedAt: new Date().toISOString(),
            sourceCollections,
            apiKeyConfigured: API_KEY != null,
            hasWaveData: false,
            apiKeyStatus: 'unauthorized',
            authError: { status: err.status, at: new Date().toISOString() },
          },
          null,
          2,
        ),
      );
      console.error(`🔴 IH_API_KEY rejeitada (HTTP ${err.status}) — sem séries de onda; ficheiro marcado apiKeyStatus:'unauthorized'.`);
      throw err;
    }
    throw err;
  }
  for (const [idEst, latest] of Object.entries(snapshots)) {
    if (stations[idEst]) stations[idEst].latest = latest;
  }

  const spots = parseSpotsFromFile();
  const spotMapping = mapSpotsToBuoys(spots, stations);
  console.log(`🗺️  Mapped ${Object.keys(spotMapping).length} spots to nearest buoy`);

  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });

  const output = {
    stations,
    spotMapping,
    fetchedAt: new Date().toISOString(),
    sourceCollections,
    apiKeyConfigured: API_KEY != null,
    hasWaveData: API_KEY != null && Object.keys(snapshots).length > 0,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`✅ IH buoy data saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`📊 Buoys: ${Object.keys(stations).length} · Mapped spots: ${Object.keys(spotMapping).length} · Wave data: ${output.hasWaveData ? 'yes' : 'no'}`);
  return output;
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
    console.error('❌ IH buoy fetch failed:', err.message || err);
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
  readPreviousFile,
  IH_API,
  COLLECTIONS,
};
