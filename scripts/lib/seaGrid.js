'use strict';

'use strict';

/**
 * seaGrid.js — partes puras do `scripts/build-sea-grid.js` (grelha regular de
 * vento + ondulação para as camadas «Vento» e «Ondulação» do /mapa).
 *
 * Formato publicado em `public/data/sea-grid.json` (v2, compacto):
 *
 *   {
 *     v: 2, generatedAt, source,
 *     step: 0.5,                        // passo mais fino (informativo)
 *     t0: <unix s>, stepHours: 1, nt,    // tempos = t0 + k·3600 (UTC, sem DST)
 *     boxes: [{ id, west, south, nx, ny, step, offset, count, mask? }],
 *        // nó (i,j) = west+i·step, south+j·step. Caixas podem SOBREPOR-SE:
 *        // o cliente prefere a mais fina e funde-a na grossa (seaGrid.ts).
 *        // `mask` (base64, bit k = nó k da caixa, LSB primeiro) diz que nós
 *        // estão guardados; sem `mask` estão todos. `offset`/`count` indexam
 *        // os nós GUARDADOS (empacotados) — mar aberto longe da costa nas
 *        // caixas finas e terra funda não ocupam bytes.
 *     n,                                // total de nós guardados (Σ count)
 *     scale: { u, v, hs, dir, per },    // valor = byte·scale (u/v com offset 128)
 *     nodata: 255,
 *     fields: { u, v, hs, dir, per }    // base64 de Uint8Array(nt·n), layout [t][nó]
 *   }
 *
 * v1 (até 2026-10-08): um `step` global, sem `mask`/`count`, caixas sem
 * sobreposição. O cliente continua a ler v1.
 *
 * Caixas (v2):
 *   - «atlantic» a 1°: fundo de 26,5–46,5 N × 34,5–0,5 W (Açores → Marrocos →
 *     golfo da Biscaia). Só nós com mar a ≤ 0,6 células.
 *   - «mainland», «azores», «madeira» a 0,5°: só nós COSTEIROS (terra a ≤ 1°
 *     e mar a ≤ 0,6 células) — o detalhe que importa para os spots. Longe da
 *     costa o cliente usa o fundo de 1°.
 *   Os nós de 1° caem em cima de nós de 0,5° (mesma malha) — pedidos uma vez.
 *
 * Quantização (erro máximo = metade do passo):
 *   u, v  — vector do vento (para onde sopra), 0,25 m/s, offset 128 → ±31,75 m/s
 *   hs    — altura significativa, 0,1 m → 0–25,4 m
 *   dir   — direcção DE ONDE vem a ondulação, 360/256° (~1,4°)
 *   per   — período, 0,1 s → 0–25,4 s
 */

const fs = require('fs');
const path = require('path');

const STEP = 0.5;
const STEP_HOURS = 1;
const NODATA = 255;
const SCALE = Object.freeze({ u: 0.25, v: 0.25, hs: 0.1, dir: 360 / 256, per: 0.1 });
const FORMAT_VERSION = 2;

/** Raio (°) até à terra que faz de um nó das caixas finas um nó «costeiro». */
const COAST_RADIUS_DEG = 1.0;

/**
 * Caixas da grelha. As finas primeiro (o cliente prefere a mais fina; a
 * ordem aqui é só a do ficheiro). Todas alinhadas à malha de 0,5° para os
 * nós de 1° coincidirem com nós finos (pedido único).
 */
const BOXES = Object.freeze([
  // Continente + Galiza/Cantábrico (até ~1,5 W) + golfo de Cádis/estreito.
  { id: 'mainland', west: -11.5, south: 35.5, east: -1.5, north: 44.5, step: 0.5, coastal: true },
  { id: 'azores', west: -31.5, south: 36.5, east: -24.5, north: 40.0, step: 0.5, coastal: true },
  { id: 'madeira', west: -18.0, south: 32.0, east: -15.5, north: 34.0, step: 0.5, coastal: true },
  { id: 'atlantic', west: -34.5, south: 26.5, east: -0.5, north: 46.5, step: 1.0, coastal: false },
]);

/**
 * Interior da Península (≥ ~80 km do Atlântico) — heurística antiga (v1),
 * usada só quando a máscara de terra não está disponível.
 */
function isDeepInland(lat, lon) {
  return lon >= -7.5 && lat >= 37.75 && lat <= 43.0;
}

/**
 * Máscara de terra baked (`public/data/land-mask.json`, scripts/bake-land-mask.mjs)
 * → função (lat, lon) → bool. null quando o ficheiro não existe/é inválido.
 */
function loadLandMask(file = path.join(__dirname, '..', '..', 'public', 'data', 'land-mask.json')) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1 || typeof raw.runs !== 'string') return null;
  const bytes = Buffer.from(raw.runs, 'base64');
  let p = 0;
  const read = () => {
    let x = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[p++];
      x |= (b & 0x7f) << shift;
      if (b < 0x80) return x;
      shift += 7;
    }
  };
  const rows = [];
  for (let r = 0; r < raw.rows; r++) {
    const n = read();
    const ts = new Array(n);
    let c = 0;
    for (let k = 0; k < n; k++) {
      c += read();
      ts[k] = c;
    }
    rows.push(ts);
  }
  return (lat, lon) => {
    const col = Math.floor((lon - raw.west) / raw.step);
    const row = Math.floor((lat - raw.south) / raw.step);
    if (row < 0 || row >= raw.rows || col < 0 || col >= raw.cols) return false;
    let k = 0;
    for (const x of rows[row]) {
      if (x > col) break;
      k++;
    }
    return (k & 1) === 1;
  };
}

/** Há mar (ou terra, com `want=true`) num quadrado de ±r° à volta do ponto? */
function anyWithin(landAt, lat, lon, r, wantLand) {
  const d = 0.05;
  const n = Math.max(1, Math.round(r / d));
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      if (landAt(lat + j * d, lon + i * d) === wantLand) return true;
    }
  }
  return false;
}

/**
 * Nós de todas as caixas, com `fetch` (pedir à API) e `store` (guardar no
 * ficheiro) e `key` (nós coincidentes entre caixas partilham o pedido).
 * `landAt` = máscara de terra; sem ela cai na heurística v1 (isDeepInland).
 */
function buildNodes(boxes = BOXES, landAt = loadLandMask()) {
  const outBoxes = [];
  const nodes = [];
  for (const b of boxes) {
    const step = b.step ?? STEP;
    const nx = Math.round((b.east - b.west) / step) + 1;
    const ny = Math.round((b.north - b.south) / step) + 1;
    const box = { id: b.id, west: b.west, south: b.south, nx, ny, step, first: nodes.length };
    for (let j = 0; j < ny; j++) {
      const lat = +(b.south + j * step).toFixed(3);
      for (let i = 0; i < nx; i++) {
        const lon = +(b.west + i * step).toFixed(3);
        let fetch;
        if (!landAt) fetch = !isDeepInland(lat, lon);
        else {
          fetch = anyWithin(landAt, lat, lon, 0.6 * step, false);
          if (fetch && b.coastal) fetch = anyWithin(landAt, lat, lon, COAST_RADIUS_DEG, true);
        }
        nodes.push({ lat, lon, fetch, store: fetch, key: `${lat},${lon}` });
      }
    }
    outBoxes.push(box);
  }
  return { boxes: outBoxes, nodes };
}

/** Localizações únicas a pedir (nós coincidentes entre caixas contam uma vez). */
function uniqueFetchKeys(nodes) {
  const seen = new Map();
  for (const n of nodes) if (n.fetch && !seen.has(n.key)) seen.set(n.key, { lat: n.lat, lon: n.lon });
  return seen;
}

function clampByte(x) {
  return x < 0 ? 0 : x > 254 ? 254 : x;
}

function finite(v) {
  return v != null && Number.isFinite(v);
}

/** Vento m/s + direcção DE ONDE sopra (°) → bytes (u,v) do vector para onde sopra. */
function encodeWind(spd, dirFrom) {
  if (!finite(spd) || !finite(dirFrom)) return [NODATA, NODATA];
  const r = (dirFrom * Math.PI) / 180;
  const u = -spd * Math.sin(r);
  const v = -spd * Math.cos(r);
  return [clampByte(Math.round(u / SCALE.u) + 128), clampByte(Math.round(v / SCALE.v) + 128)];
}

function encodeHs(hs) {
  if (!finite(hs) || hs < 0) return NODATA;
  return clampByte(Math.round(hs / SCALE.hs));
}

function encodeDir(dir) {
  if (!finite(dir)) return NODATA;
  const d = ((dir % 360) + 360) % 360;
  const b = Math.round(d / SCALE.dir) % 256;
  // 255 é o nodata — 358,6° cai no vizinho 254 (erro de 1,4°, abaixo da leitura).
  return b === NODATA ? 254 : b;
}

function encodePer(per) {
  if (!finite(per) || per <= 0) return NODATA;
  return clampByte(Math.round(per / SCALE.per));
}

/**
 * Índices horários a publicar: da hora corrente (floor) para a frente,
 * `hours`+1 passos. `times` em unix s (timeformat=unixtime).
 */
function pickTimeIndices(times, nowMs, hours) {
  const nowS = Math.floor(nowMs / 1000 / 3600) * 3600;
  let start = times.findIndex((t) => t >= nowS);
  if (start < 0) return [];
  const out = [];
  for (let k = start; k < times.length && out.length <= hours; k += STEP_HOURS) out.push(k);
  return out;
}

/**
 * Monta o ficheiro (v2) a partir das respostas por nó. `wind[k]`/`marine[k]`
 * são os objectos `hourly` do Open-Meteo para o nó k (ou null quando não
 * pedido). Só os nós com `store` entram nos campos; cada caixa leva a sua
 * máscara de nós guardados.
 */
function encodeSeaGrid({ boxes, nodes, wind, marine, times, idx, generatedAt, source }) {
  const stored = [];
  const outBoxes = [];
  let first = 0;
  for (const b of boxes) {
    const total = b.nx * b.ny;
    const bits = new Uint8Array(Math.ceil(total / 8));
    const offset = stored.length;
    const base = Number.isInteger(b.first) ? b.first : first;
    first = base + total;
    for (let q = 0; q < total; q++) {
      const k = base + q;
      // Sem `store` (chamadores antigos) o nó é guardado — nodata se não pedido.
      if (nodes[k].store === false) continue;
      bits[q >> 3] |= 1 << (q & 7);
      stored.push(k);
    }
    const count = stored.length - offset;
    const box = { id: b.id, west: b.west, south: b.south, nx: b.nx, ny: b.ny, step: b.step ?? STEP, offset, count };
    if (count !== total) box.mask = Buffer.from(bits).toString('base64');
    outBoxes.push(box);
  }
  const n = stored.length;
  const nt = idx.length;
  const u = new Uint8Array(nt * n).fill(NODATA);
  const v = new Uint8Array(nt * n).fill(NODATA);
  const hs = new Uint8Array(nt * n).fill(NODATA);
  const dir = new Uint8Array(nt * n).fill(NODATA);
  const per = new Uint8Array(nt * n).fill(NODATA);
  for (let t = 0; t < nt; t++) {
    const ti = idx[t];
    for (let s = 0; s < n; s++) {
      const k = stored[s];
      const o = t * n + s;
      const w = wind[k];
      if (w) {
        const [bu, bv] = encodeWind(w.wind_speed_10m?.[ti], w.wind_direction_10m?.[ti]);
        u[o] = bu;
        v[o] = bv;
      }
      const m = marine[k];
      if (m) {
        const h = encodeHs(m.wave_height?.[ti]);
        if (h === NODATA) continue;
        // Ondulação primeiro; mar de vento puro (sem swell) cai na onda total.
        const sd = m.swell_wave_direction?.[ti];
        const sp = m.swell_wave_period?.[ti];
        const useSwell = finite(sd) && finite(sp) && sp > 0;
        hs[o] = h;
        dir[o] = encodeDir(useSwell ? sd : m.wave_direction?.[ti]);
        per[o] = encodePer(useSwell ? sp : m.wave_period?.[ti]);
        if (dir[o] === NODATA || per[o] === NODATA) {
          hs[o] = NODATA;
          dir[o] = NODATA;
          per[o] = NODATA;
        }
      }
    }
  }
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  return {
    v: FORMAT_VERSION,
    generatedAt,
    source,
    step: Math.min(...outBoxes.map((b) => b.step)),
    t0: times[idx[0]],
    stepHours: STEP_HOURS,
    nt,
    boxes: outBoxes,
    n,
    scale: { ...SCALE },
    nodata: NODATA,
    fields: { u: b64(u), v: b64(v), hs: b64(hs), dir: b64(dir), per: b64(per) },
  };
}

/**
 * Intervalo mínimo entre corridas: 11,5 h → no máximo 2 corridas/dia (as
 * corridas full do pipeline são de 2 em 2 h). Com o oceano inteiro (~800
 * localizações × 2 APIs) 4 corridas/dia não cabiam na quota de 10k (ver o
 * cálculo em docs/MAP-LAYERS.md). A janela publicada é de 54 h e o cliente
 * aceita até 30 h de idade, por isso 12 h chega.
 */
const SEA_GRID_MIN_AGE_HOURS = 11.5;

/** Tecto do dia (UTC) que a grelha nunca deixa ultrapassar: 90 % de 10k. */
const OPEN_METEO_DAILY_QUOTA = 10_000;
const SEA_GRID_DAILY_CAP = 9_000;

/**
 * Chamadas que o update-conditions ainda vai gastar até à meia-noite UTC,
 * segundo o horário (updateSchedule.js): multi-modelo ≈ 10 ponderadas/spot,
 * best_match = 2. Pior caso — conta todas as âncoras multi-modelo.
 */
function projectConditionsCalls(nowMs, { spots = 181, perSpotMulti = 10, perSpotBest = 2 } = {}, schedule = require('./updateSchedule')) {
  const end = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1,
  );
  let total = 0;
  // As corridas do cron começam aos :17/:47 — uma por hora cheia de Lisboa.
  for (let t = Math.floor(nowMs / 3600_000 + 1) * 3600_000 + 17 * 60_000; t < end; t += 3600_000) {
    const d = new Date(t);
    if (schedule.getUpdateMode(d) !== 'full') continue;
    total += spots * (schedule.isMultiModelEnabled(d) ? perSpotMulti : perSpotBest);
  }
  return total;
}

/**
 * Guarda da quota: gasto de hoje (pipeline-meta, já com o update-conditions
 * desta corrida) + o que o pipeline ainda vai gastar hoje + o custo desta
 * grelha ≤ tecto. Devolve os números para o log.
 */
function seaGridQuotaCheck(meta, cost, nowMs, cap = SEA_GRID_DAILY_CAP, opts) {
  const dayUtc = new Date(nowMs).toISOString().slice(0, 10);
  const u = meta && meta.openMeteoUsage;
  const usedToday = u && u.dayUtc === dayUtc ? Number(u.dailyWeightedCalls) || 0 : 0;
  const spots = Number(u && u.spotsFetched) || 181;
  const rest = projectConditionsCalls(nowMs, { spots, ...opts });
  const projected = usedToday + rest + cost;
  return { ok: projected <= cap, usedToday, rest, cost, projected, cap };
}

function isSeaGridFresh(file, nowMs, maxAgeHours = SEA_GRID_MIN_AGE_HOURS) {
  if (!file || file.v !== FORMAT_VERSION || typeof file.generatedAt !== 'string') return false;
  const age = nowMs - Date.parse(file.generatedAt);
  return Number.isFinite(age) && age >= 0 && age < maxAgeHours * 3600_000;
}

/**
 * Soma as chamadas desta corrida ao contador diário do pipeline-meta (o
 * mesmo que o update-conditions usa para avisar a 80 % da quota de 10k).
 */
function bumpOpenMeteoUsage(meta, calls, nowMs) {
  const out = meta && typeof meta === 'object' ? { ...meta } : {};
  const dayUtc = new Date(nowMs).toISOString().slice(0, 10);
  const prev = out.openMeteoUsage && typeof out.openMeteoUsage === 'object' ? out.openMeteoUsage : {};
  const sameDay = prev.dayUtc === dayUtc;
  out.openMeteoUsage = {
    ...prev,
    dayUtc,
    dailyWeightedCalls: (sameDay ? Number(prev.dailyWeightedCalls) || 0 : 0) + calls,
    seaGridCalls: calls,
  };
  return out;
}

module.exports = {
  FORMAT_VERSION,
  COAST_RADIUS_DEG,
  SEA_GRID_MIN_AGE_HOURS,
  OPEN_METEO_DAILY_QUOTA,
  SEA_GRID_DAILY_CAP,
  loadLandMask,
  uniqueFetchKeys,
  projectConditionsCalls,
  seaGridQuotaCheck,
  STEP,
  STEP_HOURS,
  NODATA,
  SCALE,
  BOXES,
  isDeepInland,
  buildNodes,
  encodeWind,
  encodeHs,
  encodeDir,
  encodePer,
  pickTimeIndices,
  encodeSeaGrid,
  isSeaGridFresh,
  bumpOpenMeteoUsage,
};
