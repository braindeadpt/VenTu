#!/usr/bin/env node
'use strict';

/**
 * build-sea-grid.js — grelha regular de 0,5° de vento + ondulação sobre o mar
 * de Portugal (continente, Açores, Madeira), 54 h horárias, para as camadas
 * «Vento» e «Ondulação» do /mapa. Substitui o IDW entre spots: os campos
 * ambientais deixam de depender de que spots existem (ou estão filtrados).
 *
 * Corre no job de dados (update-data.yml), depois do «Update Conditions», só
 * em corridas `full` e só quando o ficheiro tem ≥ 5,5 h (os modelos saem de 6
 * em 6 h) — ~4 corridas/dia × ~800 chamadas ponderadas. O total entra no
 * contador diário de pipeline-meta.json (openMeteoUsage.dailyWeightedCalls).
 * Falha suave: sem ficheiro novo fica o último commitado; o cliente cai no
 * IDW dos spots quando a grelha não cobre a hora pedida.
 *
 * Fontes (as mesmas do pipeline):
 *   - api.open-meteo.com/v1/forecast        wind_speed_10m, wind_direction_10m (best_match)
 *   - marine-api.open-meteo.com/v1/marine   wave_height, swell_wave_direction/period,
 *                                            wave_direction/period (fallback sem swell)
 * Várias coordenadas por pedido (`latitude=a,b&longitude=c,d`); cada
 * localização conta como 1 chamada para a quota, por isso os lotes são
 * espaçados (< 600/min).
 *
 * Formato e quantização: scripts/lib/seaGrid.js. Leitura: src/lib/seaGrid.ts.
 *
 * Uso: node scripts/build-sea-grid.js [--force] [--out public/data/sea-grid.json] [--hours 54]
 * Env: OPEN_METEO_FORECAST_URL / OPEN_METEO_MARINE_URL (override para testes locais).
 */

const fs = require('fs');
const path = require('path');
const {
  buildNodes,
  encodeSeaGrid,
  pickTimeIndices,
  isSeaGridFresh,
  bumpOpenMeteoUsage,
} = require('./lib/seaGrid');

const BATCH = 100;
const BATCH_PAUSE_MS = Number(process.env.SEA_GRID_PAUSE_MS) || 11_000;
const UA = 'VenTu sea-grid (ventu.surf; github.com/braindeadpt/VenTu)';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'public', 'data', 'sea-grid.json')));
const META = path.join(ROOT, 'public', 'data', 'pipeline-meta.json');
const HOURS = Math.max(12, Math.min(96, Number(arg('--hours', '54')) || 54));
const FORCE = process.argv.includes('--force');
const FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = process.env.OPEN_METEO_MARINE_URL || 'https://marine-api.open-meteo.com/v1/marine';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 2) {
    await sleep(65_000);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 100)}…`);
  return res.json();
}

/** Devolve um array alinhado com `nodes` (null onde o nó não é pedido). */
async function fetchBatched(base, hourly, nodes, extra, counter) {
  const want = nodes.map((n, k) => (n.fetch ? k : -1)).filter((k) => k >= 0);
  const out = new Array(nodes.length).fill(null);
  for (let b = 0; b < want.length; b += BATCH) {
    const chunk = want.slice(b, b + BATCH);
    const params = new URLSearchParams({
      latitude: chunk.map((k) => nodes[k].lat).join(','),
      longitude: chunk.map((k) => nodes[k].lon).join(','),
      hourly: hourly.join(','),
      timeformat: 'unixtime',
      timezone: 'GMT',
      forecast_days: '4',
      ...extra,
    });
    const json = await fetchJson(`${base}?${params}`);
    const list = Array.isArray(json) ? json : [json];
    if (list.length !== chunk.length) throw new Error(`esperava ${chunk.length} localizações, veio ${list.length}`);
    counter.calls += chunk.length;
    list.forEach((loc, i) => {
      const k = chunk[i];
      // O marine devolve a célula de mar mais próxima — longe do pedido
      // (> 0,3°) é interior: fica sem dado em vez de copiar o mar do lado.
      const far =
        Math.abs(loc.latitude - nodes[k].lat) > 0.3 || Math.abs(loc.longitude - nodes[k].lon) > 0.3;
      out[k] = far ? null : { ...loc.hourly };
    });
    console.log(`  ${new URL(base).host} ${Math.min(b + BATCH, want.length)}/${want.length}`);
    if (b + BATCH < want.length) await sleep(BATCH_PAUSE_MS);
  }
  return out;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const now = Date.now();
  if (!FORCE && isSeaGridFresh(readJson(OUT), now)) {
    console.log('[sea-grid] ficheiro com < 5,5 h — salta (usar --force para refazer)');
    return;
  }
  const { boxes, nodes } = buildNodes();
  const asked = nodes.filter((n) => n.fetch).length;
  console.log(`[sea-grid] ${nodes.length} nós a 0,5° (${asked} pedidos por API), ${HOURS} h`);
  const counter = { calls: 0 };
  let wind;
  let marine;
  try {
    wind = await fetchBatched(
      FORECAST_URL,
      ['wind_speed_10m', 'wind_direction_10m'],
      nodes,
      { wind_speed_unit: 'ms' },
      counter,
    );
    marine = await fetchBatched(
      MARINE_URL,
      ['wave_height', 'swell_wave_direction', 'swell_wave_period', 'wave_direction', 'wave_period'],
      nodes,
      { cell_selection: 'sea' },
      counter,
    );
  } finally {
    // Mesmo numa falha a meio, o que já foi gasto conta para a quota.
    if (counter.calls > 0 && fs.existsSync(META)) {
      const meta = readJson(META);
      if (meta) fs.writeFileSync(META, `${JSON.stringify(bumpOpenMeteoUsage(meta, counter.calls, now), null, 2)}\n`);
    }
    console.log(`[sea-grid] ${counter.calls} chamadas ponderadas ao Open-Meteo`);
  }

  const ref = wind.find((w) => w && Array.isArray(w.time));
  if (!ref) throw new Error('sem séries de vento');
  const idx = pickTimeIndices(ref.time, now, HOURS);
  if (idx.length < 13) throw new Error(`só ${idx.length} horas disponíveis`);
  // As séries do marine têm o mesmo eixo horário (mesmo forecast_days/GMT);
  // um desalinhamento invalidava a ondulação inteira — falha alto.
  const mref = marine.find((m) => m && Array.isArray(m.time));
  if (!mref || mref.time[idx[0]] !== ref.time[idx[0]]) throw new Error('eixo horário do marine ≠ do vento');

  const file = encodeSeaGrid({
    boxes,
    nodes,
    wind,
    marine,
    times: ref.time,
    idx,
    generatedAt: new Date(now).toISOString(),
    source: 'Open-Meteo forecast (best_match) + marine (best_match)',
  });
  const tmp = `${OUT}.tmp`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(file));
  fs.renameSync(tmp, OUT);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`[sea-grid] ${file.nt} horas × ${file.n} nós → ${path.relative(ROOT, OUT)} (${kb} KB)`);
}

main().catch((err) => {
  console.error('[sea-grid] falhou:', err.message);
  process.exit(1);
});
