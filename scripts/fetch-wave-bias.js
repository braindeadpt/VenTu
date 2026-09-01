/**
 * Fetch wave skill/bias: Open-Meteo Historical Marine (ERA5) vs wave buoys →
 * `public/data/wave-bias.json`.
 *
 * Two observation platforms:
 * - IH Datawell Waverider (getDatawellData, last 13 days, needs IH_API_KEY):
 *   the primary national source, covering the mainland PT regions;
 * - Puertos del Estado ES buoys via Copernicus Marine S3 (keyless WMO route):
 *   Cabo Silleiro/Villano (Galiza) + Bilbao/Cabo Peñas (Cantábrico) + Golfo
 *   de Cádiz. The public bucket only keeps `latest/<day>/`, so the hourly
 *   readings accumulate in public/data/wmo-bias-archive.json run after run
 *   (dedupe by UTC hour) until the sample reaches MIN_BIAS_N.
 *
 * For each buoy it pairs the measured hm0 series with the ERA5 hourly wave
 * height at the same coordinates and hour, then computes per-buoy and
 * per-region bias metrics (ME/MAE/RMSE/correlation). The per-region table is
 * pooled from the spot→buoy mapping, so each region inherits the bias of the
 * buoy its spots map to (ES buoys → Caminha/Viana/Esposende/Porto/… via
 * Cabo Silleiro; Alentejo/Algarve via Golfo de Cádiz).
 *
 * The correction itself is applied by update-conditions.js behind
 * VENTU_WAVE_BIAS_CORRECTION=1 (guards: N≥30, |ME|≥0.15 m, clamp).
 *
 * Coherence gate: if the daily ES×PT report (buoy-coherence.json, written by
 * check-buoy-coherence.js before this step) marks a pair incoherent, that ES
 * buoy's bias is still reported per-buoy but NOT attributed to regions
 * (regionAttribution=false + coherenceGate block) — the buoy may be reading a
 * different wave field.
 *
 * Graceful degradation: the ES part is keyless and always runs; on failure (or
 * no usable sample) we keep the previous wave-bias.json and exit 0 — this
 * layer must never block the pipeline. EXCEPT for a rejected key: a 401/403
 * from getDatawellData fails ALL IH buoys at once (never a single-buoy fault),
 * so it is propagated as an IhAuthError and run() fails fast with a Telegram
 * alert (same fail-fast pattern as fetch-ih-buoys.js) — a dead key must never
 * silently degrade just the IH side of the bias.
 */

const fs = require('fs');
const path = require('path');
const {
  fetchBuoyStations,
  fetchBuoyWaveSeries,
  mapSpotsToBuoys,
  waveWindow,
  DEFAULT_WAVE_API,
  DEFAULT_IH_API,
  DEFAULT_COLLECTIONS,
  isIhAuthError,
} = require('./lib/ihBuoys.js');
const { notifyIhAuthFailure } = require('./fetch-ih-buoys.js');
const {
  fetchHistoricalWaveSeries,
  alignPairs,
  computeBias,
  aggregateRegions,
  parseSpotsWithRegions,
  BIAS_WINDOW_DAYS,
  MIN_BIAS_N,
  MIN_BIAS_M,
} = require('./lib/buoyBias.js');
const {
  dayKey,
  listDayWaveKeys,
  fetchNetCdfBytes,
  parseNetCdf,
  surfaceSeries,
  CATALOG_BY_CODE,
  ES_BUOY_CODES,
  KEYLESS_WMO_CODES,
} = require('./lib/copernicusBuoys.js');
const {
  readArchive,
  writeArchive,
  mergeBuoyReadings,
  pruneArchive,
  mapSpotsToNearestBuoy,
} = require('./lib/wmoBiasArchive.js');
const { incoherentEsCodes } = require('./lib/buoyCoherence.js');

const IH_API = process.env.IH_API_URL || DEFAULT_IH_API;
const WAVE_API = process.env.IH_BUOY_WAVE_API_URL || DEFAULT_WAVE_API;
const API_KEY = process.env.IH_API_KEY?.trim() || null;
const COLLECTIONS = (process.env.IH_BUOY_COLLECTIONS || DEFAULT_COLLECTIONS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUTPUT_PATH =
  process.env.WAVE_BIAS_OUTPUT_PATH || path.join(__dirname, '../public/data/wave-bias.json');
const ARCHIVE_PATH =
  process.env.WMO_BIAS_ARCHIVE_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/wmo-bias-archive.json');
/** Relatório ES×PT (check-buoy-coherence.js) — gate da atribuição regional. */
const COHERENCE_PATH =
  process.env.BUOY_COHERENCE_PATH ||
  path.join(__dirname, '../public/data/buoy-coherence.json');

function readJsonOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Puertos del Estado buoys tracked by the keyless Copernicus route. */
// (definição central no catálogo copernicusBuoys.js — ES_BUOY_CODES)

const MODEL_NOTE =
  'Open-Meteo Historical Marine devolve ERA5 (reanálise). past_days da API de previsão ' +
  'devolve o mesmo backfill ERA5 — não existem previsões arquivadas para medir skill real ' +
  'do forecast; o que se mede aqui é o viés do modelo ERA5 face à boia. A correcção é ' +
  'aplicada ao best_match como primeiro passo de calibração (flag VENTU_WAVE_BIAS_CORRECTION=1) ' +
  'e deve ser validada contra o card de onda observada antes de ligar em produção.';

function dateOnly(iso) {
  return iso.slice(0, 10);
}

/**
 * Keyless ES buoy bias: Copernicus (WMO, Puertos del Estado) series vs ERA5,
 * accumulated run after run in wmo-bias-archive.json.
 * @returns {{ buoys: object, regions: object, archived: number } | null}
 */
async function fetchWmoEsBias() {
  console.log('🇪🇸 ES buoys (Copernicus WMO, sem key) vs ERA5...\n');

  const archive = readArchive(ARCHIVE_PATH);
  archive.fetchedAt = new Date().toISOString();

  const day = dayKey();
  const keys = await listDayWaveKeys(day);
  // Acumula todos os códigos WMO keyless (ES + PT): a Nazaré 6200199 entra
  // também aqui para o forecast-skill a usar como observações nacionais (o
  // loop de viés ERA5 abaixo continua filtrado a ES_BUOY_CODES, por isso a
  // leitura PT é arquivada mas não atribui viés a regiões).
  const wanted = keys.filter((k) => KEYLESS_WMO_CODES.includes(k.code));
  let archived = 0;
  for (const { key, code } of wanted) {
    try {
      const raw = await parseNetCdf(await fetchNetCdfBytes(key));
      const readings = surfaceSeries(raw);
      const meta = {
        name: CATALOG_BY_CODE[code]?.name,
        area: CATALOG_BY_CODE[code]?.area,
        lat: readings[0]?.lat,
        lon: readings[0]?.lon,
      };
      archived += mergeBuoyReadings(archive, code, meta, readings);
      const entry = archive.buoys[code];
      console.log(
        `   ${code} (${meta.name ?? code}): ${readings.length} leituras hoje → ${entry.readings.length} acumuladas`,
      );
    } catch (err) {
      console.warn(`   ⚠️ ${code}: ${err.message}`);
    }
  }
  pruneArchive(archive);
  writeArchive(archive, ARCHIVE_PATH);
  console.log(`   ✅ Arquivo: ${Object.keys(archive.buoys).length} boias, ${archived} leituras novas\n`);

  const window = waveWindow(BIAS_WINDOW_DAYS * 24);
  const startDate = dateOnly(window.startDate);
  const endDate = dateOnly(window.endDate);

  const buoys = {};
  const pairsByBuoy = {};
  for (const [code, entry] of Object.entries(archive.buoys)) {
    if (!ES_BUOY_CODES.includes(code) || !entry.readings.length) continue;
    try {
      const model = await fetchHistoricalWaveSeries(entry.lat, entry.lon, startDate, endDate);
      const pairs = alignPairs(entry.readings, model);
      if (pairs.length < MIN_BIAS_N) {
        console.log(
          `   ⚠️ ${code} (${entry.name ?? code}): só ${pairs.length} pares acumulados (< ${MIN_BIAS_N}) — amostra insuficiente`,
        );
        continue;
      }
      const stats = computeBias(pairs);
      buoys[code] = {
        name: entry.name ?? code,
        area: entry.area,
        lat: entry.lat,
        lon: entry.lon,
        source: 'wmo-es',
        ...stats,
      };
      pairsByBuoy[code] = pairs;
      console.log(
        `   ✓ ${code} ${entry.name ?? code}: n=${stats.n} · ME ${stats.me >= 0 ? '+' : ''}${stats.me} m · MAE ${stats.mae} m · RMSE ${stats.rmse} m · r ${stats.corr ?? '—'}`,
      );
    } catch (err) {
      console.warn(`   ⚠️ ${code}: ${err.message}`);
    }
  }

  if (Object.keys(buoys).length === 0) return null;

  // ── Gate cross-border (buoy-coherence.json, corrido antes no workflow) ────
  // Se um par ES×PT estiver incoherent, a boia ES pode estar a ler outra onda:
  // o bias per-buoy fica no relatório (marcado regionAttribution=false), mas
  // NÃO é atribuído a regiões — evita corrigir o NW/Algarve com uma leitura
  // suspeita.
  const coherence = readJsonOrNull(COHERENCE_PATH);
  const { liveBuoys, coherenceGate } = applyCoherenceGate(
    buoys,
    archive.buoys,
    coherence,
    ES_BUOY_CODES,
  );
  if (coherenceGate) {
    console.warn(
      `🔴 ${coherenceGate.gatedCodes.join(', ')} incoherentes vs boia PT (buoy-coherence) — bias calculado mas NÃO atribuído a regiões (regionAttribution=false).`,
    );
  }

  const spots = parseSpotsWithRegions();
  const esSpotMapping = mapSpotsToNearestBuoy(spots, liveBuoys);
  const regions = aggregateRegions(spots, esSpotMapping, pairsByBuoy);
  console.log(`📊 Regiões com viés ES calculado: ${Object.keys(regions).length}\n`);

  return { buoys, regions, archived, coherenceGate };
}

async function fetchWaveBias() {
  console.log('📏 Wave bias — Open-Meteo (ERA5) vs buoys...\n');

  const buoys = {};
  const regions = {};
  let ihOk = 0;

  // ── ES part (keyless, always) ─────────────────────────────────────────────
  let esResult = null;
  try {
    esResult = await fetchWmoEsBias();
    if (esResult) {
      Object.assign(buoys, esResult.buoys);
      Object.assign(regions, esResult.regions);
    }
  } catch (err) {
    console.warn(`⚠️ ES buoy bias failed: ${err.message}`);
  }

  // ── IH part (needs key) ───────────────────────────────────────────────────
  if (!API_KEY) {
    console.log('   ℹ️ IH_API_KEY not set — sem séries IH; só o viés ES (WMO/Copernicus) entra.\n');
  } else {
    const { stations, sourceCollections } = await fetchBuoyStations(IH_API, COLLECTIONS);
    const active = Object.values(stations).filter(
      (s) => s.status !== 'inactive' && s.status !== 'inativa',
    );
    console.log(`📍 ${Object.keys(stations).length} buoys IH, ${active.length} active (${sourceCollections.join(', ')})`);

    const spots = parseSpotsWithRegions();
    const spotMapping = mapSpotsToBuoys(spots, stations);
    console.log(`🗺️  Mapped ${Object.keys(spotMapping).length}/${spots.length} spots to a buoy`);

    const window = waveWindow(BIAS_WINDOW_DAYS * 24);
    const startDate = dateOnly(window.startDate);
    const endDate = dateOnly(window.endDate);
    console.log(`   Window: ${startDate} → ${endDate} (UTC)\n`);

    const pairsByBuoy = {};
    for (const station of active) {
      try {
        const obs = await fetchBuoyWaveSeries(API_KEY, station.idEst, WAVE_API, fetch, window);
        if (obs.length === 0) {
          console.log(`   ⚠️ ${station.idEst} (${station.name}): sem leituras IH na janela`);
          continue;
        }
        const model = await fetchHistoricalWaveSeries(station.lat, station.lon, startDate, endDate);
        if (model.length === 0) {
          console.log(`   ⚠️ ${station.idEst} (${station.name}): ERA5 vazio na janela`);
          continue;
        }
        const pairs = alignPairs(obs, model);
        if (pairs.length < MIN_BIAS_N) {
          console.log(`   ⚠️ ${station.idEst} (${station.name}): só ${pairs.length} pares (< ${MIN_BIAS_N}) — amostra insuficiente`);
          continue;
        }
        const stats = computeBias(pairs);
        buoys[station.idEst] = {
          name: station.name,
          area: station.area,
          lat: station.lat,
          lon: station.lon,
          source: 'ih',
          ...stats,
        };
        pairsByBuoy[station.idEst] = pairs;
        ihOk += 1;
        console.log(
          `   ✓ ${station.idEst} ${station.name}: n=${stats.n} · ME ${stats.me >= 0 ? '+' : ''}${stats.me} m · MAE ${stats.mae} m · RMSE ${stats.rmse} m · r ${stats.corr ?? '—'}`,
        );
      } catch (err) {
        // Key rejeitada (401/403) falha TODAS as boias — nunca uma avaria de
        // uma só. Propagar para o run() falhar cedo com alerta (fail-fast).
        if (isIhAuthError(err)) throw err;
        console.warn(`   ⚠️ ${station.idEst} (${station.name}): ${err.message}`);
      }
    }

    if (ihOk > 0) {
      const ihRegions = aggregateRegions(spots, spotMapping, pairsByBuoy);
      Object.assign(regions, ihRegions);
    }
  }

  if (Object.keys(buoys).length === 0) {
    console.warn('⚠️ Nenhuma boia com amostra suficiente — a manter o wave-bias.json anterior, se existir.');
    return null;
  }

  const window = waveWindow(BIAS_WINDOW_DAYS * 24);
  console.log(`\n📊 Regiões com viés calculado: ${Object.keys(regions).length}`);

  const output = {
    fetchedAt: new Date().toISOString(),
    window: { startDate: dateOnly(window.startDate), endDate: dateOnly(window.endDate) },
    models: {
      observed:
        'IH Datawell Waverider — hm0 (altura significativa espectral, m) + Puertos del Estado WMO via Copernicus Marine S3 (sem key) — hm0',
      reference: 'Open-Meteo Historical Marine — ERA5 hourly wave_height (m)',
      note: MODEL_NOTE,
    },
    thresholds: { minN: MIN_BIAS_N, minBiasM: MIN_BIAS_M },
    buoys,
    regions,
  };
  if (esResult?.coherenceGate) {
    output.coherenceGate = {
      ...esResult.coherenceGate,
      note: 'Bias per-buoy calculado mas não atribuído a regiões (par ES×PT incoherent no buoy-coherence.json).',
    };
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✅ Wave bias saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  return output;
}

/**
 * Estado da key no ficheiro do passo anterior (fetch-ih-buoys.js corre antes
 * no workflow) para gating da transição: se já estava `unauthorized`, a key já
 * foi reportada — não se avisa o Telegram a cada run decorrido.
 * @returns {boolean} true quando ih-buoys.json grava apiKeyStatus:'unauthorized'
 */
function readIhBuoysAuthState() {
  return readJsonOrNull(
    process.env.IH_BUOYS_PATH || path.join(__dirname, '../public/data/ih-buoys.json'),
  )?.apiKeyStatus === 'unauthorized';
}

async function run() {
  try {
    const out = await fetchWaveBias();
    if (out) {
      const regs = Object.values(out.regions);
      const usable = regs.filter((r) => r.n >= MIN_BIAS_N && Math.abs(r.me) >= MIN_BIAS_M);
      console.log(
        `📈 Regiões com correcção aplicável (n≥${MIN_BIAS_N}, |ME|≥${MIN_BIAS_M} m): ${usable.length}/${regs.length}`,
      );
    }
  } catch (err) {
    if (isIhAuthError(err)) {
      // Fail-early: key rejeitada — o passo falha cedo com alerta, em vez de o
      // viés IH degradar em silêncio (mesmo padrão do fetch-ih-buoys.js).
      err.previouslyUnauthorized = readIhBuoysAuthState();
      const res = await notifyIhAuthFailure(err, { layer: 'O viés de onda (wave-bias)' });
      if (res.notified) console.log('   Telegram: alerta enviado.');
      console.error(
        `::error::IH_API_KEY rejeitada (HTTP ${err.status ?? '?'}) no fetch-wave-bias — viés IH desactivado. ` +
          `O workflow falhou cedo de propósito; renova a key (docs/IH_API_KEY.md).`,
      );
      process.exitCode = 1;
      return;
    }
    console.error('❌ Wave bias fetch failed:', err.message || err);
    console.warn('⚠️ Mantendo o wave-bias.json anterior, se existir — a pipeline continua.');
  }
}

/**
 * Aplica o gate cross-border à atribuição regional do viés ES.
 *
 * Boias ES com um par `incoherent` no buoy-coherence.json (vs boia PT) ficam
 * com o bias per-buoy marcado `regionAttribution: false` e são excluídas do
 * mapa spot→boia (não atribuem viés a regiões). `review`/`insufficient`/sem
 * relatório não bloqueiam. Puro — sem I/O, testável.
 * @param {object} buoys per-buoy stats (mutado: regionAttribution flags)
 * @param {Record<string, object>} archiveBuoys entradas do arquivo (por código)
 * @param {object | null} coherence relatório buoy-coherence.json
 * @param {Array<string>} esCodes códigos da rota ES
 * @returns {{ liveBuoys: Record<string, object>, coherenceGate: { day: string | null, gatedCodes: Array<string> } | null }}
 */
function applyCoherenceGate(buoys, archiveBuoys, coherence, esCodes) {
  const gated = incoherentEsCodes(coherence, esCodes);
  for (const code of gated) {
    if (buoys[code]) buoys[code].regionAttribution = false;
  }
  const gatedSet = new Set(gated);
  const liveBuoys = {};
  for (const [code, entry] of Object.entries(archiveBuoys)) {
    if (!esCodes.includes(code) || gatedSet.has(code)) continue;
    liveBuoys[code] = entry;
  }
  const coherenceGate =
    gated.length > 0 ? { day: coherence?.day ?? null, gatedCodes: gated } : null;
  return { liveBuoys, coherenceGate };
}

if (require.main === module) {
  run();
}

module.exports = {
  fetchWaveBias,
  fetchWmoEsBias,
  run,
  dateOnly,
  ES_BUOY_CODES,
  applyCoherenceGate,
};
