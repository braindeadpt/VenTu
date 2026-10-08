#!/usr/bin/env node
'use strict';

/**
 * build-sea-grid.js — grelha de vento + ondulação sobre o mar inteiro do
 * /mapa (Açores → Marrocos → golfo da Biscaia), 54 h horárias, para as
 * camadas «Vento» e «Ondulação». Fundo a 1° + caixas costeiras a 0,5°
 * (continente com Galiza/Cantábrico e golfo de Cádis, Açores, Madeira) —
 * caixas e selecção de nós em scripts/lib/seaGrid.js.
 *
 * Corre no job de dados (update-data.yml), depois do «Update Conditions», só
 * em corridas `full`, só quando o ficheiro tem ≥ 11,5 h (≤ 2 corridas/dia) e
 * só se a quota deixar: gasto de hoje + o que o pipeline ainda vai gastar
 * até à meia-noite UTC (pior caso) + esta grelha ≤ 9 000 (90 % de 10k). O
 * gasto entra no contador diário de pipeline-meta.json
 * (openMeteoUsage.dailyWeightedCalls). Falha suave: sem ficheiro novo fica o
 * último commitado; o cliente cai no IDW dos spots quando a grelha não cobre
 * a hora pedida.
 *
 * Fontes (as mesmas do pipeline):
 *   - api.open-meteo.com/v1/forecast        wind_speed_10m, wind_direction_10m (best_match)
 *   - marine-api.open-meteo.com/v1/marine   wave_height, swell_wave_direction/period,
 *                                            wave_direction/period (fallback sem swell)
 * Várias coordenadas por pedido (`latitude=a,b&longitude=c,d`); cada
 * localização conta como 1 chamada para a quota, por isso os lotes são
 * pequenos e espaçados (50 a cada 6 s ≈ 500/min < 600/min do plano livre).
 *
 * Formato e quantização: scripts/lib/seaGrid.js. Leitura: src/lib/seaGrid.ts.
 *
 * Uso: node scripts/build-sea-grid.js [--force] [--no-quota-guard] [--out public/data/sea-grid.json] [--hours 54]
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
  uniqueFetchKeys,
  seaGridQuotaCheck,
  SEA_GRID_MIN_AGE_HOURS,
} = require('./lib/seaGrid');

const BATCH = 50;
const BATCH_PAUSE_MS = Number(process.env.SEA_GRID_PAUSE_MS) || 6_000;
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
const NO_QUOTA_GUARD = process.argv.includes('--no-quota-guard');
const FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = process.env.OPEN_METEO_MARINE_URL || 'https://marine-api.open-meteo.com/v1/marine';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 3) {
    // limite por minuto (600) — espera a janela seguinte, com recuo
    await sleep(attempt * 62_000);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 100)}…`);
  return res.json();
}

/**
 * Pede cada localização única uma vez e devolve um array alinhado com `nodes`
 * (null onde o nó não é pedido). `marineFar`: o marine devolve a célula de
 * mar mais próxima — longe do pedido (> 0,3°) é terra: fica sem dado em vez
 * de copiar o mar do lado.
 */
async function fetchBatched(base, hourly, nodes, extra, counter, marineFar = false) {
  const keys = [...uniqueFetchKeys(nodes).entries()];
  const byKey = new Map();
  for (let b = 0; b < keys.length; b += BATCH) {
    const chunk = keys.slice(b, b + BATCH);
    const params = new URLSearchParams({
      latitude: chunk.map(([, p]) => p.lat).join(','),
      longitude: chunk.map(([, p]) => p.lon).join(','),
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
      const [key, p] = chunk[i];
      const far = marineFar && (Math.abs(loc.latitude - p.lat) > 0.3 || Math.abs(loc.longitude - p.lon) > 0.3);
      byKey.set(key, far ? null : { ...loc.hourly });
    });
    console.log(`  ${new URL(base).host} ${Math.min(b + BATCH, keys.length)}/${keys.length}`);
    if (b + BATCH < keys.length) await sleep(BATCH_PAUSE_MS);
  }
  return nodes.map((n) => (n.fetch ? byKey.get(n.key) ?? null : null));
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
    console.log(`[sea-grid] ficheiro com < ${SEA_GRID_MIN_AGE_HOURS} h — salta (usar --force para refazer)`);
    return;
  }
  const { boxes, nodes } = buildNodes();
  const asked = uniqueFetchKeys(nodes).size;
  const desc = boxes.map((b) => `${b.id} ${b.step}°`).join(', ');
  console.log(`[sea-grid] ${nodes.length} nós (${desc}); ${asked} localizações por API, ${HOURS} h`);
  if (!NO_QUOTA_GUARD) {
    const q = seaGridQuotaCheck(readJson(META), asked * 2, now);
    console.log(
      `[sea-grid] quota: hoje ${q.usedToday} + pipeline até 00 UTC ${q.rest} + grelha ${q.cost} = ${q.projected} (tecto ${q.cap})`,
    );
    if (!q.ok) {
      console.log('::notice title=sea-grid::quota Open-Meteo apertada hoje — grelha não refeita (fica a anterior)');
      return;
    }
  }
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
      true,
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
    source: 'Open-Meteo forecast (best_match) + marine (best_match); 1° Atlantic + 0.5° coastal',
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
