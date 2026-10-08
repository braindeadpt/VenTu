'use strict';

/**
 * seaGrid.js — partes puras do `scripts/build-sea-grid.js` (grelha de vento +
 * ondulação para as camadas «Vento» e «Ondulação» do /mapa).
 *
 * v3 (2026-10): grelha de MODELO em grelha, sem quota — NOAA GFS 0,5° (vento
 * a 10 m) e WaveWatch III global 0,5° (Hs, swell/onda total), servidos pelo
 * ERDDAP do PacIOOS (griddap, CSV). Nenhuma chamada ao Open-Meteo.
 *
 * Formato publicado em `public/data/sea-grid.json` (v3 = v2 + `fade`):
 *
 *   {
 *     v: 3, generatedAt, source,
 *     step: 0.5,                        // passo mais fino (informativo)
 *     t0: <unix s>, stepHours: 3, nt,    // tempos = t0 + k·stepHours·3600 (UTC)
 *     fade: 4,                          // esbatido (°) na borda EXTERIOR do domínio
 *     boxes: [{ id, west, south, nx, ny, step, offset, count, mask? }],
 *        // nó (i,j) = west+i·step, south+j·step. As caixas SOBREPÕEM-SE (da
 *        // mais fina para a mais grossa): o cliente prefere a mais fina e
 *        // funde-a na grossa (src/lib/seaGrid.ts). `mask` (base64, bit k =
 *        // nó k da caixa, LSB primeiro) diz que nós estão guardados: só nós de
 *        // MAR do WW3, e numa caixa grossa só fora do interior da caixa mais
 *        // fina (onde a fina manda). O cliente preenche terra e buracos com o
 *        // mar mais próximo antes de amostrar; a costa é cortada por vector.
 *     n,                                // total de nós guardados (Σ count)
 *     scale: { u, v, hs, dir, per },    // valor = byte·scale (u/v com offset 128)
 *     nodata: 255,
 *     fields: { u, v, hs, dir, per }    // base64 de Uint8Array(nt·n), layout [t][nó]
 *   }
 *
 * v2 (até 2026-10-08, Open-Meteo por ponto): igual sem `fade`; o encoder v2
 * (`encodeSeaGrid`) fica só para os stubs dos testes e2e. v1: um `step`
 * global, sem máscara. O cliente lê as três versões.
 *
 * Caixas v3 (TIERS): núcleo 0,5° (24–52 N × 38 W–6 E: Açores, Madeira,
 * Canárias, Península, Biscaia, Alborão), regional 1° (14–60 N × 56 W–14 E)
 * e oceano 2° (0–72 N × 100 W–44 E: Atlântico Norte inteiro, Mediterrâneo,
 * mar do Norte). Esbatido de 4° só na borda exterior do oceano.
 *
 * Quantização (erro máximo = metade do passo):
 *   u, v  — vector do vento (para onde sopra), v3: 0,5 m/s (v2: 0,25), offset 128
 *   hs    — altura significativa, 0,1 m → 0–25,4 m
 *   dir   — direcção DE ONDE vem a ondulação, 360/256° (~1,4°)
 *   per   — período, 0,1 s → 0–25,4 s
 */

const STEP = 0.5;
const NODATA = 255;
const SCALE = Object.freeze({ u: 0.25, v: 0.25, hs: 0.1, dir: 360 / 256, per: 0.1 });
const SCALE_V3 = Object.freeze({ u: 0.5, v: 0.5, hs: 0.1, dir: 360 / 256, per: 0.1 });
const FORMAT_VERSION = 3;

/** Caixas v3, da mais fina para a mais grossa (alinhadas à malha de 0,5°). */
const TIERS = Object.freeze([
  Object.freeze({ id: 'core', step: 0.5, south: 24, north: 52, west: -38, east: 6 }),
  Object.freeze({ id: 'regional', step: 1, south: 14, north: 60, west: -56, east: 14 }),
  Object.freeze({ id: 'ocean', step: 2, south: 0, north: 72, west: -100, east: 44 }),
]);
/**
 * Mares interiores que o WW3 global do PacIOOS NÃO modela (Mediterrâneo,
 * mar Negro, Báltico — Hs é NaN lá): sem ondulação, mas com vento do GFS.
 * Os nós destas caixas guardam-se sempre (vento; Hs fica nodata).
 */
const WIND_ONLY_SEAS = Object.freeze([
  Object.freeze({ id: 'med', south: 30, north: 46, west: -6, east: 37 }),
  Object.freeze({ id: 'black', south: 40, north: 47.5, west: 26, east: 42 }),
  Object.freeze({ id: 'baltic', south: 53, north: 66, west: 9, east: 31 }),
]);
const inWindOnlySea = (lat, lon) =>
  WIND_ONLY_SEAS.some((b) => lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east);

/** Esbatido (°) na borda exterior do domínio (caixa mais grossa). */
const SEA_GRID_FADE_DEG = 4;
/** Células finas da zona de fusão fina → grossa (igual a SEA_GRID_BLEND_CELLS do cliente). */
const BLEND_CELLS = 2;
/** Passo temporal publicado (h): o GFS do PacIOOS é tri-horário. */
const STEP_HOURS_V3 = 3;
/**
 * Janela publicada (h): 0–48 h → 17 instantes (a régua «48 h» do /mapa); o
 * ficheiro refaz-se de 6 em 6 h e o cliente aceita até 30 h de idade.
 */
const SEA_GRID_HOURS = 48;

/** ERDDAP do PacIOOS (Universidade do Havai / NOAA IOOS) — griddap sem chave nem quota. */
const ERDDAP_BASE = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap';
const ERDDAP_WIND = { dataset: 'ncep_global', vars: ['ugrd10m', 'vgrd10m'], depth: false, stride: 1 };
const ERDDAP_WAVE = { dataset: 'ww3_global', vars: ['Thgt', 'sdir', 'sper', 'Tdir', 'Tper'], depth: true, stride: 3 };

function clampByte(x) {
  return x < 0 ? 0 : x > 254 ? 254 : x;
}

function finite(v) {
  return v != null && Number.isFinite(v);
}

/** Vento m/s + direcção DE ONDE sopra (°) → bytes (u,v) do vector para onde sopra. */
function encodeWind(spd, dirFrom, scale = SCALE) {
  if (!finite(spd) || !finite(dirFrom)) return [NODATA, NODATA];
  const r = (dirFrom * Math.PI) / 180;
  return encodeUV(-spd * Math.sin(r), -spd * Math.cos(r), scale);
}

/** Vector (u,v) m/s → bytes. */
function encodeUV(u, v, scale = SCALE_V3) {
  if (!finite(u) || !finite(v)) return [NODATA, NODATA];
  return [clampByte(Math.round(u / scale.u) + 128), clampByte(Math.round(v / scale.v) + 128)];
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
 * Encoder v2 (Open-Meteo por nó) — já não corre no pipeline; fica para os
 * stubs dos testes e2e (o cliente continua a ler v2). `wind[k]`/`marine[k]`
 * são objectos `hourly` do Open-Meteo para o nó k (ou null).
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
  return {
    v: 2,
    generatedAt,
    source,
    step: Math.min(...outBoxes.map((b) => b.step)),
    t0: times[idx[0]],
    stepHours: 1,
    nt,
    boxes: outBoxes,
    n,
    scale: { ...SCALE },
    nodata: NODATA,
    fields: { u: b64(u), v: b64(v), hs: b64(hs), dir: b64(dir), per: b64(per) },
  };
}

function b64(a) {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
}

// ── v3: grelhas de modelo (ERDDAP) ──────────────────────────────────────────

function tierDims(t) {
  return {
    nx: Math.round((t.east - t.west) / t.step) + 1,
    ny: Math.round((t.north - t.south) / t.step) + 1,
  };
}

/** Instantes a publicar: do múltiplo de `stepHours` corrente (floor) até +`hours`. */
function pickTimes(nowMs, hours = SEA_GRID_HOURS, stepHours = STEP_HOURS_V3) {
  const st = stepHours * 3600;
  const t0 = Math.floor(nowMs / 1000 / st) * st;
  const out = [];
  for (let t = t0; t <= t0 + hours * 3600; t += st) out.push(t);
  return out;
}

const isoZ = (unixS) => new Date(unixS * 1000).toISOString().replace('.000Z', 'Z');

/**
 * URLs griddap (CSV) que cobrem uma caixa: a longitude do ERDDAP vai de 0 a
 * 359,5, por isso uma caixa que cruza Greenwich pede dois pedaços. `stride`
 * espacial = passo da caixa / 0,5°; temporal = o do dataset (ww3 é horário).
 */
function erddapUrls(spec, tier, times, base = ERDDAP_BASE) {
  const sp = Math.max(1, Math.round(tier.step / 0.5));
  const t0 = isoZ(times[0]);
  const t1 = isoZ(times[times.length - 1]);
  const lat = `[(${tier.south}):${sp}:(${tier.north})]`;
  const parts = [];
  if (tier.west < 0) {
    const e = Math.min(tier.east, -tier.step);
    parts.push([360 + tier.west, 360 + Math.min(e, -0.5)]);
  }
  if (tier.east >= 0) {
    // primeiro nó ≥ 0 na malha da caixa
    const k = Math.ceil((0 - tier.west) / tier.step - 1e-9);
    parts.push([Math.max(0, tier.west + k * tier.step), tier.east]);
  }
  return parts.map(([w, e]) => {
    const lon = `[(${w}):${sp}:(${e})]`;
    const dim = `[(${t0}):${spec.stride}:(${t1})]${spec.depth ? '[(0.0)]' : ''}${lat}${lon}`;
    return `${base}/${spec.dataset}.csv?${spec.vars.map((v) => `${v}${dim}`).join(',')}`;
  });
}

/**
 * CSV do griddap → linhas {time (unix s), lat, lon (−180..180), valores}.
 * Linha 1 = nomes, linha 2 = unidades. NaN/vazio → null.
 */
function parseErddapCsv(text, vars) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].split(',');
  const it = head.indexOf('time');
  const ilat = head.indexOf('latitude');
  const ilon = head.indexOf('longitude');
  const iv = vars.map((v) => head.indexOf(v));
  if (it < 0 || ilat < 0 || ilon < 0 || iv.some((i) => i < 0)) throw new Error(`CSV do ERDDAP sem colunas ${vars.join(',')}`);
  const rows = [];
  for (let k = 2; k < lines.length; k++) {
    const line = lines[k];
    if (!line) continue;
    const c = line.split(',');
    const time = Date.parse(c[it]) / 1000;
    let lon = Number(c[ilon]);
    if (lon > 180) lon -= 360;
    const vals = iv.map((i) => {
      const s = c[i];
      if (s === '' || s === 'NaN') return null;
      const x = Number(s);
      return Number.isFinite(x) ? x : null;
    });
    rows.push({ time, lat: Number(c[ilat]), lon, vals });
  }
  return rows;
}

/**
 * Linhas → arrays densos da caixa, layout [t][j·nx+i] (Float32, NaN = sem
 * dado). Linhas fora da caixa/da malha ou de instantes não pedidos ignoram-se.
 */
function gridFromRows(rows, tier, times, nvars) {
  const { nx, ny } = tierDims(tier);
  const n = nx * ny;
  const tIndex = new Map(times.map((t, k) => [t, k]));
  const out = Array.from({ length: nvars }, () => new Float32Array(times.length * n).fill(NaN));
  let hit = 0;
  for (const r of rows) {
    const k = tIndex.get(r.time);
    if (k === undefined) continue;
    const fi = (r.lon - tier.west) / tier.step;
    const fj = (r.lat - tier.south) / tier.step;
    const i = Math.round(fi);
    const j = Math.round(fj);
    if (Math.abs(fi - i) > 1e-3 || Math.abs(fj - j) > 1e-3 || i < 0 || j < 0 || i >= nx || j >= ny) continue;
    const o = k * n + j * nx + i;
    for (let v = 0; v < nvars; v++) if (r.vals[v] != null) out[v][o] = r.vals[v];
    hit++;
  }
  return { arrays: out, hit, n, nx, ny };
}

/**
 * Nós guardados de cada caixa: mar no WW3 (Hs válido em algum instante) ou
 * dentro de um mar só-vento (WIND_ONLY_SEAS) e,
 * nas caixas grossas, fora do interior da caixa mais fina anterior (encolhido
 * pela zona de fusão + uma célula grossa, para o bilinear grosso da zona de
 * fusão ter nós verdadeiros).
 */
function storedMask(tiers, k, hsArr, nt) {
  const t = tiers[k];
  const { nx, ny } = tierDims(t);
  const n = nx * ny;
  const keep = new Uint8Array(n);
  const fine = k > 0 ? tiers[k - 1] : null;
  const shrink = fine ? BLEND_CELLS * fine.step + t.step : 0;
  for (let j = 0; j < ny; j++) {
    const lat = t.south + j * t.step;
    for (let i = 0; i < nx; i++) {
      const lon = t.west + i * t.step;
      const q = j * nx + i;
      let sea = inWindOnlySea(lat, lon);
      for (let s = 0; s < nt && !sea; s++) sea = !Number.isNaN(hsArr[s * n + q]);
      if (!sea) continue;
      if (
        fine &&
        lat > fine.south + shrink &&
        lat < fine.north - shrink &&
        lon > fine.west + shrink &&
        lon < fine.east - shrink
      ) continue;
      keep[q] = 1;
    }
  }
  return keep;
}

/**
 * Monta o ficheiro v3. `data[k]` = { u, v, hs, sdir, sper, tdir, tper } da
 * caixa k (Float32Array [t][nó], NaN = sem dado). Swell primeiro; mar de
 * vento puro (sem swell) cai na direcção/período da onda total.
 */
function encodeGriddedSeaGrid({ tiers = TIERS, data, times, generatedAt, source, fade = SEA_GRID_FADE_DEG, stepHours = STEP_HOURS_V3 }) {
  const nt = times.length;
  const outBoxes = [];
  const parts = [];
  let offset = 0;
  tiers.forEach((t, k) => {
    const { nx, ny } = tierDims(t);
    const total = nx * ny;
    const d = data[k];
    const keep = storedMask(tiers, k, d.hs, nt);
    const idx = [];
    const bits = new Uint8Array(Math.ceil(total / 8));
    for (let q = 0; q < total; q++) {
      if (!keep[q]) continue;
      bits[q >> 3] |= 1 << (q & 7);
      idx.push(q);
    }
    const box = { id: t.id, west: t.west, south: t.south, nx, ny, step: t.step, offset, count: idx.length };
    if (idx.length !== total) box.mask = Buffer.from(bits).toString('base64');
    outBoxes.push(box);
    parts.push({ d, idx, total });
    offset += idx.length;
  });
  const n = offset;
  const u = new Uint8Array(nt * n).fill(NODATA);
  const v = new Uint8Array(nt * n).fill(NODATA);
  const hs = new Uint8Array(nt * n).fill(NODATA);
  const dir = new Uint8Array(nt * n).fill(NODATA);
  const per = new Uint8Array(nt * n).fill(NODATA);
  for (let s = 0; s < nt; s++) {
    let o = s * n;
    for (const { d, idx, total } of parts) {
      for (const q of idx) {
        const a = s * total + q;
        const [bu, bv] = encodeUV(d.u[a], d.v[a], SCALE_V3);
        u[o] = bu;
        v[o] = bv;
        const h = encodeHs(d.hs[a]);
        if (h !== NODATA) {
          const useSwell = finite(d.sdir[a]) && finite(d.sper[a]) && d.sper[a] > 0;
          const bd = encodeDir(useSwell ? d.sdir[a] : d.tdir[a]);
          const bp = encodePer(useSwell ? d.sper[a] : d.tper[a]);
          if (bd !== NODATA && bp !== NODATA) {
            hs[o] = h;
            dir[o] = bd;
            per[o] = bp;
          }
        }
        o++;
      }
    }
  }
  return {
    v: FORMAT_VERSION,
    generatedAt,
    source,
    step: Math.min(...tiers.map((t) => t.step)),
    t0: times[0],
    stepHours,
    nt,
    fade,
    boxes: outBoxes,
    n,
    scale: { ...SCALE_V3 },
    nodata: NODATA,
    fields: { u: b64(u), v: b64(v), hs: b64(hs), dir: b64(dir), per: b64(per) },
  };
}

/**
 * Intervalo mínimo entre corridas: 5,5 h — o GFS/WW3 do PacIOOS actualiza de
 * 6 em 6 h, sem quota; a janela publicada é de 54 h e o cliente aceita até
 * 30 h de idade.
 */
const SEA_GRID_MIN_AGE_HOURS = 5.5;

function isSeaGridFresh(file, nowMs, maxAgeHours = SEA_GRID_MIN_AGE_HOURS) {
  if (!file || file.v !== FORMAT_VERSION || typeof file.generatedAt !== 'string') return false;
  const age = nowMs - Date.parse(file.generatedAt);
  return Number.isFinite(age) && age >= 0 && age < maxAgeHours * 3600_000;
}

module.exports = {
  FORMAT_VERSION,
  STEP,
  NODATA,
  SCALE,
  SCALE_V3,
  TIERS,
  WIND_ONLY_SEAS,
  inWindOnlySea,
  BLEND_CELLS,
  SEA_GRID_FADE_DEG,
  STEP_HOURS_V3,
  SEA_GRID_HOURS,
  SEA_GRID_MIN_AGE_HOURS,
  ERDDAP_BASE,
  ERDDAP_WIND,
  ERDDAP_WAVE,
  encodeWind,
  encodeUV,
  encodeHs,
  encodeDir,
  encodePer,
  encodeSeaGrid,
  tierDims,
  pickTimes,
  erddapUrls,
  parseErddapCsv,
  gridFromRows,
  storedMask,
  encodeGriddedSeaGrid,
  isSeaGridFresh,
};
