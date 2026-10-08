'use strict';

/**
 * seaGrid.js — partes puras do `scripts/build-sea-grid.js` (grelha regular de
 * vento + ondulação para as camadas «Vento» e «Ondulação» do /mapa).
 *
 * Formato publicado em `public/data/sea-grid.json` (v1, compacto):
 *
 *   {
 *     v: 1, generatedAt, source,
 *     step: 0.5,                       // graus
 *     t0: <unix s>, stepHours: 1, nt,   // tempos = t0 + k·3600 (UTC, sem DST)
 *     boxes: [{ id, west, south, nx, ny, offset }],   // nó (i,j) = west+i·step, south+j·step
 *     n,                               // total de nós (soma nx·ny)
 *     scale: { u, v, hs, dir, per },   // valor = byte·scale (u/v com offset 128)
 *     nodata: 255,
 *     fields: { u, v, hs, dir, per }   // base64 de Uint8Array(nt·n), layout [t][nó]
 *   }
 *
 * Porquê bytes: 438 nós × 55 horas × 5 campos ≈ 120 KB crus (~160 KB em
 * base64, ~110 KB gzip) contra ~1,2 MB do JSON com arrays de números. O orçamento
 * de public/data (32 MB, docs/DATA-HISTORY.md) tem pouca folga.
 *
 * Quantização (erro máximo = metade do passo):
 *   u, v  — vector do vento (para onde sopra), 0,25 m/s, offset 128 → ±31,75 m/s
 *   hs    — altura significativa, 0,1 m → 0–25,4 m
 *   dir   — direcção DE ONDE vem a ondulação, 360/256° (~1,4°)
 *   per   — período, 0,1 s → 0–25,4 s
 */

const STEP = 0.5;
const STEP_HOURS = 1;
const NODATA = 255;
const SCALE = Object.freeze({ u: 0.25, v: 0.25, hs: 0.1, dir: 360 / 256, per: 0.1 });

/**
 * Caixas da grelha — as mesmas três áreas do mapa (continente, Açores,
 * Madeira), com margem de mar para o campo não acabar em cima da costa.
 * A grelha de 0,5° é a da maquete aprovada (Open-Meteo, «grelha 0,5°»).
 */
const BOXES = Object.freeze([
  { id: 'mainland', west: -12.5, south: 35.5, east: -6.0, north: 43.5 },
  { id: 'azores', west: -32.0, south: 36.0, east: -24.0, north: 40.5 },
  { id: 'madeira', west: -18.0, south: 32.0, east: -15.5, north: 34.0 },
]);

/**
 * Interior da Península (≥ ~80 km do Atlântico): sem pedido à API — não há
 * mar e o vento de lá não entra em nenhuma célula de água por interpolação.
 * Poupa ~44 chamadas por corrida à quota diária do Open-Meteo.
 */
function isDeepInland(lat, lon) {
  return lon >= -7.5 && lat >= 37.75 && lat <= 43.0;
}

function buildNodes(boxes = BOXES, step = STEP) {
  const outBoxes = [];
  const nodes = [];
  for (const b of boxes) {
    const nx = Math.round((b.east - b.west) / step) + 1;
    const ny = Math.round((b.north - b.south) / step) + 1;
    outBoxes.push({ id: b.id, west: b.west, south: b.south, nx, ny, offset: nodes.length });
    for (let j = 0; j < ny; j++) {
      const lat = +(b.south + j * step).toFixed(3);
      for (let i = 0; i < nx; i++) {
        const lon = +(b.west + i * step).toFixed(3);
        nodes.push({ lat, lon, fetch: !isDeepInland(lat, lon) });
      }
    }
  }
  return { boxes: outBoxes, nodes };
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
 * Monta o ficheiro a partir das respostas por nó. `wind[k]`/`marine[k]` são
 * os objectos `hourly` do Open-Meteo para o nó k (ou null quando não pedido).
 */
function encodeSeaGrid({ boxes, nodes, wind, marine, times, idx, generatedAt, source }) {
  const n = nodes.length;
  const nt = idx.length;
  const u = new Uint8Array(nt * n).fill(NODATA);
  const v = new Uint8Array(nt * n).fill(NODATA);
  const hs = new Uint8Array(nt * n).fill(NODATA);
  const dir = new Uint8Array(nt * n).fill(NODATA);
  const per = new Uint8Array(nt * n).fill(NODATA);
  for (let t = 0; t < nt; t++) {
    const ti = idx[t];
    for (let k = 0; k < n; k++) {
      const o = t * n + k;
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
    v: 1,
    generatedAt,
    source,
    step: STEP,
    t0: times[idx[0]],
    stepHours: STEP_HOURS,
    nt,
    boxes,
    n,
    scale: { ...SCALE },
    nodata: NODATA,
    fields: { u: b64(u), v: b64(v), hs: b64(hs), dir: b64(dir), per: b64(per) },
  };
}

/**
 * O ficheiro existente ainda serve? Os modelos (IFS/GFS, MFWAM/WAM) saem de
 * 6 em 6 h — reescrever a cada corrida do pipeline (~2 h) só gastava quota e
 * metia blobs novos no histórico do git sem dado novo.
 */
function isSeaGridFresh(file, nowMs, maxAgeHours = 5.5) {
  if (!file || file.v !== 1 || typeof file.generatedAt !== 'string') return false;
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
