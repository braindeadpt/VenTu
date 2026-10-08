#!/usr/bin/env node
'use strict';

/**
 * build-sea-grid.js — grelha de vento + ondulação do /mapa (camadas «Vento» e
 * «Ondulação»), v3: modelos em GRELHA, sem quota por chamada.
 *
 * Fontes (ERDDAP do PacIOOS — Universidade do Havai / NOAA IOOS, griddap CSV,
 * sem chave):
 *   - ncep_global  NOAA GFS 0,5°, tri-horário, 8 dias: ugrd10m, vgrd10m (m/s)
 *   - ww3_global   WaveWatch III global 0,5°, horário, ~7 dias: Thgt (Hs),
 *                  sdir/sper (swell), Tdir/Tper (onda total — fallback)
 *   https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global.html
 *   https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ww3_global.html
 * Zero chamadas ao Open-Meteo (a guarda de quota da v2 desapareceu).
 *
 * Domínio: três caixas sobrepostas (scripts/lib/seaGrid.js TIERS) — núcleo
 * 0,5°, regional 1°, oceano 2° (0–72 N × 100 W–44 E) — 0–48 h de 3 em 3 h.
 * Formato e quantização: scripts/lib/seaGrid.js. Leitura: src/lib/seaGrid.ts.
 *
 * Corre num job PRÓPRIO do update-data.yml (com timeout próprio, fora do
 * orçamento do MTG); só refaz quando o ficheiro tem ≥ 5,5 h. Falha suave:
 * sem ficheiro novo fica o último commitado (o cliente aceita até 30 h).
 *
 * Uso: node scripts/build-sea-grid.js [--force] [--out public/data/sea-grid.json] [--hours 54]
 * Env: SEA_GRID_ERDDAP_BASE (override do servidor, para testes locais).
 */

const fs = require('fs');
const path = require('path');
const {
  TIERS,
  ERDDAP_BASE,
  ERDDAP_WIND,
  ERDDAP_WAVE,
  SEA_GRID_HOURS,
  SEA_GRID_MIN_AGE_HOURS,
  pickTimes,
  erddapUrls,
  parseErddapCsv,
  gridFromRows,
  encodeGriddedSeaGrid,
  isSeaGridFresh,
} = require('./lib/seaGrid');

const UA = 'VenTu sea-grid (ventu.surf; github.com/braindeadpt/VenTu)';
const REQ_TIMEOUT_MS = 120_000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'public', 'data', 'sea-grid.json')));
const HOURS = Math.max(24, Math.min(96, Number(arg('--hours', String(SEA_GRID_HOURS))) || SEA_GRID_HOURS));
const FORCE = process.argv.includes('--force');
const BASE = process.env.SEA_GRID_ERDDAP_BASE || ERDDAP_BASE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, attempt = 1) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 140)}…`);
    return await res.text();
  } catch (err) {
    // O ERDDAP recarrega os datasets de vez em quando (404 «unknown
    // datasetID» durante segundos) — 4 tentativas com recuo crescente.
    if (attempt >= 4) throw err;
    console.log(`  tentativa ${attempt} falhou (${String(err.cause?.code ?? err.message).slice(0, 160)}) — repete`);
    await sleep(attempt * 20_000);
    return fetchText(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

/** Uma caixa de um dataset → arrays densos [t][nó] por variável. */
async function fetchTier(spec, tier, times) {
  const rows = [];
  for (const url of erddapUrls(spec, tier, times, BASE)) {
    const text = await fetchText(url);
    for (const r of parseErddapCsv(text, spec.vars)) rows.push(r);
  }
  const g = gridFromRows(rows, tier, times, spec.vars.length);
  const want = g.n * times.length;
  if (g.hit < want * 0.98) throw new Error(`${spec.dataset}/${tier.id}: ${g.hit}/${want} valores na malha`);
  return g.arrays;
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
    console.log(`[sea-grid] ficheiro v3 com < ${SEA_GRID_MIN_AGE_HOURS} h — salta (usar --force para refazer)`);
    return;
  }
  const times = pickTimes(now, HOURS);
  console.log(
    `[sea-grid] ERDDAP ${new URL(BASE).host}: ${TIERS.map((t) => `${t.id} ${t.step}°`).join(', ')}; ` +
      `${times.length} instantes (${new Date(times[0] * 1000).toISOString()} +${HOURS} h)`,
  );
  // Caixa a caixa, vento e ondas em paralelo (2 pedidos de cada vez — com 6
  // em simultâneo o servidor recusava ligações, «fetch failed»).
  const data = [];
  for (const tier of TIERS) {
    const [[u, v], [hs, sdir, sper, tdir, tper]] = await Promise.all([
      fetchTier(ERDDAP_WIND, tier, times),
      fetchTier(ERDDAP_WAVE, tier, times),
    ]);
    console.log(`  ${tier.id}: ok`);
    data.push({ u, v, hs, sdir, sper, tdir, tper });
  }
  const file = encodeGriddedSeaGrid({
    tiers: TIERS,
    data,
    times,
    generatedAt: new Date(now).toISOString(),
    source: 'NOAA GFS 0.5° (10 m wind) + WaveWatch III global 0.5° via PacIOOS ERDDAP; 0.5°/1°/2° nested',
  });
  const tmp = `${OUT}.tmp`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(file));
  fs.renameSync(tmp, OUT);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`[sea-grid] ${file.nt} instantes × ${file.n} nós → ${path.relative(ROOT, OUT)} (${kb} KB)`);
}

main().catch((err) => {
  console.error('[sea-grid] falhou:', err.message);
  process.exit(1);
});
