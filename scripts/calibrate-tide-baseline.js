'use strict';

/**
 * Semeia data-state/tide-anomaly-baseline.json — o offset de datum por
 * estação maregráfica (obs vs ZH − modelo vs MSL).
 *
 * Por estação activa em public/data/ih-tides.json:
 *   1. Série 1-min das últimas ~24 h do IH (EDR locations/{id} →
 *      CoverageCollection, id = `${codp}-${id_mar}` do listing);
 *   2. sea_level_height_msl passado do Open-Meteo no mesmo ponto;
 *   3. resíduo por hora modelo = média das obs a ±30 min − valor modelo;
 *   4. cada resíduo entra no baseline via recordResidual (mesma regra da
 *      cadência — a mediana converge para offset + viés).
 *
 * Idempotente: corre de novo = substitui os resíduos da estação (a janela
 * rolling continua a refinar em produção). One-off + rerunnable.
 *
 *   node scripts/calibrate-tide-baseline.js [--stations 152,74] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const tideAnomaly = require('./lib/tideAnomaly.js');

const IH_API = process.env.IH_API_URL || 'https://ogcapi.hidrografico.pt';
const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const IH_TIDES_PATH = path.join(__dirname, '../public/data/ih-tides.json');
const BASELINE_PATH =
  process.env.TIDE_BASELINE_PATH ||
  path.join(__dirname, '../data-state/tide-anomaly-baseline.json');
/** Janela de pairing obs↔modelo (±30 min cobre o 1-min alinhado à hora). */
const PAIR_WINDOW_MS = 30 * 60 * 1000;
const REQUEST_GAP_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** codp → { locId, title, lat, lon } a partir do listing de locations. */
async function fetchLocationIndex() {
  const data = await fetchJson(
    `${IH_API}/collections/tide_obs_nrt/instances/l1/locations?limit=100&f=json`,
  );
  const index = new Map();
  for (const f of data.features || []) {
    const p = f.properties || {};
    if (p.codp == null || !f.id) continue;
    const lat = Number(p.lat ?? f.geometry?.coordinates?.[1]);
    const lon = Number(p.lon ?? f.geometry?.coordinates?.[0]);
    index.set(Number(p.codp), { locId: f.id, title: p.title, lat, lon });
  }
  return index;
}

/** {times: ms[], values: m[]} da série 1-min (CoverageCollection). */
async function fetchStationSeries(locId) {
  const data = await fetchJson(
    `${IH_API}/collections/tide_obs_nrt/instances/l1/locations/${encodeURIComponent(locId)}?f=json`,
  );
  const cov = data.coverages?.[0];
  const times = cov?.domain?.axes?.t?.values ?? [];
  const values = cov?.ranges?.sea_surface_height?.values ?? [];
  if (!times.length || times.length !== values.length) {
    throw new Error(`series vazia/malformada para ${locId}`);
  }
  return {
    times: times.map((t) => new Date(t).getTime()),
    values: values.map((v) => Number(v)),
  };
}

async function fetchModelSeaLevel(lat, lon) {
  const url =
    `${MARINE_API}?latitude=${lat}&longitude=${lon}` +
    `&hourly=sea_level_height_msl&past_days=2&forecast_days=1&timezone=UTC`;
  const data = await fetchJson(url);
  const times = data.hourly?.time ?? [];
  const values = data.hourly?.sea_level_height_msl ?? [];
  if (!times.length || times.length !== values.length) {
    throw new Error(`sea_level vazio para ${lat},${lon}`);
  }
  return {
    times: times.map((t) => new Date(`${t}:00Z`).getTime()),
    values: values.map((v) => Number(v)),
  };
}

/** Amostras [t, resíduo] por hora modelo (média das obs a ±30 min). */
function pairResiduals(series, model) {
  const samples = [];
  for (let i = 0; i < model.times.length; i += 1) {
    const t = model.times[i];
    const v = model.values[i];
    if (!Number.isFinite(v)) continue;
    let sum = 0;
    let n = 0;
    // série ~1-min: scan linear é ~1440 iterações — barato por estação.
    for (let j = 0; j < series.times.length; j += 1) {
      const dt = Math.abs(series.times[j] - t);
      if (dt > PAIR_WINDOW_MS) continue;
      const obs = series.values[j];
      if (Number.isFinite(obs)) {
        sum += obs;
        n += 1;
      }
    }
    if (n >= 10) samples.push([t, sum / n - v]);
  }
  return samples;
}

async function calibrate({ onlyCodps = null, dryRun = false } = {}) {
  console.log('🌊 Calibrating tide anomaly baseline (IH obs ZH − OM sea_level MSL)\n');

  const ihTides = JSON.parse(fs.readFileSync(IH_TIDES_PATH, 'utf8'));
  const wanted = Object.keys(ihTides.stations || {}).map(Number);
  if (!wanted.length) throw new Error('ih-tides.json sem estações — corre fetch-ih-tides primeiro');

  const locIndex = await fetchLocationIndex();
  console.log(`📍 ${locIndex.size} locations IH · ${wanted.length} estações em ih-tides.json\n`);

  let stations;
  try {
    stations = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).stations || {};
  } catch {
    stations = {};
  }
  if (dryRun) stations = {};

  let done = 0;
  let failed = 0;
  for (const codp of wanted) {
    if (onlyCodps && !onlyCodps.includes(codp)) continue;
    const loc = locIndex.get(codp);
    if (!loc || !Number.isFinite(loc.lat)) {
      console.warn(`  ⚠️ codp ${codp}: sem location/coords — skip`);
      failed += 1;
      continue;
    }
    try {
      const [series, model] = await Promise.all([
        fetchStationSeries(loc.locId),
        fetchModelSeaLevel(loc.lat, loc.lon),
      ]);
      const samples = pairResiduals(series, model);
      if (!samples.length) {
        console.warn(`  ⚠️ ${loc.title} (${codp}): 0 pares obs×modelo — skip`);
        failed += 1;
        continue;
      }
      // Substitui a janela da estação (idempotente) — amostras com timestamp
      // para a comparação por fase de maré.
      stations[String(codp)] = { samples: [] };
      for (const [t, r] of samples) {
        tideAnomaly.recordResidual(stations, codp, r, new Date(t).toISOString());
      }
      const e = stations[String(codp)];
      console.log(
        `  ✓ ${loc.title} (${codp}): ${e.n} resíduos · offset ${e.median} m`,
      );
      done += 1;
    } catch (err) {
      console.warn(`  ⚠️ codp ${codp}: ${err.message}`);
      failed += 1;
    }
    await sleep(REQUEST_GAP_MS);
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    atomicWriteJson(BASELINE_PATH, {
      stations,
      minPairs: tideAnomaly.MIN_BASELINE_PAIRS,
      windowMax: tideAnomaly.MAX_RESIDUALS,
      updatedAt: new Date().toISOString(),
      seededBy: 'calibrate-tide-baseline.js (IH EDR 24h vs OM sea_level past_days=2)',
    });
    console.log(`\n✅ Baseline → ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }
  console.log(`📊 ${done} estações calibradas · ${failed} falhadas`);
  return { done, failed, stations };
}

// CLI: --stations 152,74 · --dry-run
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const si = args.indexOf('--stations');
  const onlyCodps =
    si >= 0 && args[si + 1]
      ? args[si + 1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite)
      : null;
  calibrate({ onlyCodps, dryRun }).catch((err) => {
    console.error('❌', err.message || err);
    process.exitCode = 1;
  });
}

module.exports = { calibrate, pairResiduals, fetchStationSeries, fetchModelSeaLevel, PAIR_WINDOW_MS };
