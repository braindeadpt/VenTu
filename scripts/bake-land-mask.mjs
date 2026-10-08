#!/usr/bin/env node
// Bake the lazy-loaded land mask for the /mapa field layers (wind, «Ondulação»,
// Hs, SST, currents) over the whole sea domain of the map: Azores → Morocco →
// Bay of Biscay, lat 26.5–46.5 N, lon 34–1 W.
//
// Sources
//   - Natural Earth 50m land (public domain) — everything (Morocco, France,
//     Canaries, Spain outside the GADM zone…).
//   - GADM 4.1 level-0 PT+ES rings already baked in src/lib/landRings.ts
//     (scripts/bake-land-rings.mjs) — finer coast, authoritative for Iberia
//     (incl. Galicia/Cantabria/Andalusia), the Azores and Madeira.
//   land(cell) = GADM(cell) || (NE(cell) && !gadmZone(cell))
//   so the Portuguese coast keeps the GADM line (no NE 50m offset), and NE
//   fills the rest.
//
// Format (public/data/land-mask.json, v1):
//   { v: 1, west, south, step, cols, rows, source, runs: base64 }
//   `runs` = per row (south → north): varint count of transitions, then each
//   transition column as a varint delta from the previous one. State starts as
//   sea at column 0 and toggles at every transition (even-odd). The client
//   (src/lib/landMask.ts) keeps the transitions and binary-searches them — no
//   cols×rows bitmap in memory.
//
// Usage: node scripts/bake-land-mask.mjs [--ne path/to/ne_50m_land.geojson] [--step 0.01]
import { readFileSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const WEST = -34;
const EAST = -1;
const SOUTH = 26.5;
const NORTH = 46.5;
const STEP = Number(arg('--step', '0.01'));
const COLS = Math.round((EAST - WEST) / STEP);
const ROWS = Math.round((NORTH - SOUTH) / STEP);
const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';

/** Cells where the GADM PT+ES rings are the truth (Iberia, Azores, Madeira). */
function gadmZone(lat, lon) {
  // Gibraltar (UK) is not in GADM ESP — leave it to Natural Earth.
  if (lat > 36.1 && lat < 36.16 && lon > -5.37 && lon < -5.33) return false;
  if (lon >= -10.6 && lon <= EAST && lat >= 35.95 && lat < 43.38) return true;
  // North of the Bidasoa (43.38 N) France starts east of ~1.78 W.
  if (lon >= -10.6 && lon < -1.78 && lat >= 43.38 && lat <= 44.3) return true;
  if (lon >= -31.6 && lon <= -24.6 && lat >= 36.8 && lat <= 39.95) return true; // Açores
  if (lon >= -17.4 && lon <= -16.1 && lat >= 32.3 && lat <= 33.2) return true; // Madeira + Porto Santo
  return false;
}

function fillRing(grid, ring) {
  let s = Infinity;
  let n = -Infinity;
  for (const [, y] of ring) {
    if (y < s) s = y;
    if (y > n) n = y;
  }
  const r0 = Math.max(0, Math.floor((s - SOUTH) / STEP));
  const r1 = Math.min(ROWS - 1, Math.ceil((n - SOUTH) / STEP));
  for (let row = r0; row <= r1; row++) {
    const y = SOUTH + (row + 0.5) * STEP;
    const xs = [];
    for (let i = 0, m = ring.length - 1; i < m; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if (y1 <= y !== y2 <= y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // cell centre inside the polygon
      const c0 = Math.max(0, Math.ceil((xs[k] - WEST) / STEP - 0.5));
      const c1 = Math.min(COLS - 1, Math.floor((xs[k + 1] - WEST) / STEP - 0.5));
      if (c1 >= c0) grid.fill(1, row * COLS + c0, row * COLS + c1 + 1);
    }
  }
}

function outerRings(geojson) {
  const out = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) {
      const ring = p[0];
      let w = Infinity;
      let e = -Infinity;
      let s = Infinity;
      let n = -Infinity;
      for (const [x, y] of ring) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
      if (e < WEST || w > EAST || n < SOUTH || s > NORTH) continue;
      out.push(ring);
    }
  }
  return out;
}

async function loadNe() {
  const p = arg('--ne', null);
  if (p) return JSON.parse(readFileSync(p, 'utf8'));
  const res = await fetch(NE_URL, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Natural Earth ${res.status}`);
  return res.json();
}

function loadGadmRings() {
  const s = readFileSync(path.join(ROOT, 'src/lib/landRings.ts'), 'utf8');
  return JSON.parse(s.slice(s.indexOf('= [') + 2).replace(/;\s*$/, ''));
}

function varint(out, x) {
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80);
    x >>>= 7;
  }
  out.push(x);
}

const ne = new Uint8Array(COLS * ROWS);
for (const ring of outerRings(await loadNe())) fillRing(ne, ring);
const gadm = new Uint8Array(COLS * ROWS);
for (const ring of loadGadmRings()) fillRing(gadm, ring);

const bytes = [];
let transitions = 0;
let landCells = 0;
for (let row = 0; row < ROWS; row++) {
  const lat = SOUTH + (row + 0.5) * STEP;
  const ts = [];
  let state = 0;
  for (let c = 0; c < COLS; c++) {
    const k = row * COLS + c;
    const lon = WEST + (c + 0.5) * STEP;
    const land = gadm[k] === 1 || (ne[k] === 1 && !gadmZone(lat, lon)) ? 1 : 0;
    landCells += land;
    if (land !== state) {
      ts.push(c);
      state = land;
    }
  }
  varint(bytes, ts.length);
  let prev = 0;
  for (const c of ts) {
    varint(bytes, c - prev);
    prev = c;
  }
  transitions += ts.length;
}

const file = {
  v: 1,
  source: 'GADM 4.1 (PT+ES, src/lib/landRings.ts) + Natural Earth 50m land',
  west: WEST,
  south: SOUTH,
  step: STEP,
  cols: COLS,
  rows: ROWS,
  runs: Buffer.from(bytes).toString('base64'),
};
const json = JSON.stringify(file);
const out = path.join(ROOT, 'public/data/land-mask.json');
writeFileSync(out, `${json}\n`);
console.log(
  `[land-mask] ${COLS}×${ROWS} @ ${STEP}° · ${transitions} transitions · ${((100 * landCells) / (COLS * ROWS)).toFixed(1)}% land` +
    ` → ${(json.length / 1024).toFixed(1)} KB (${(gzipSync(json).length / 1024).toFixed(1)} KB gzip)`,
);
