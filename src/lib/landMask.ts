/**
 * Land mask for the map field layers.
 *
 * `landRings.ts` carries GADM 4.1 level-0 coastlines (PT + ES) simplified to
 * ~0.4 km. At module init the rings are scanline-rasterized into a coarse
 * lat/lon bitmap (~1.8 km cells) so `pointOnLand` is an O(1) lookup — the
 * same path used per grid cell (Hs/SST) and per particle frame (wind/
 * currents), where a ray-cast against ~4k vertices would be too slow.
 *
 * Two tiers:
 *  1. Bundled GADM raster (sync, below) — PT + ES only, lat 32–43 N. Always
 *     available, so Hs/SST/currents never paint Portuguese land even before
 *     anything else loads.
 *  2. Lazy full-domain mask (`public/data/land-mask.json`, ~26 KB / ~14 KB
 *     gzip, baked by `scripts/bake-land-mask.mjs` from the same GADM rings +
 *     Natural Earth 50m land) covering the whole sea domain of the map —
 *     Azores → Morocco → Bay of Biscay (26.5–46.5 N, 34–1 W), ~500 m cells.
 *     Stored as per-row transition columns (binary search, no bitmap).
 *     Once `loadLandMask()` resolves, `pointOnLand` answers from it inside its
 *     domain (Galicia, Cantabria, Andalusia, Morocco, France, Canaries…).
 * Points outside both domains count as sea.
 */
import { getAssetPath } from '@/lib/paths';
import { LAND_RINGS } from './landRings';

const LAT_S = 32.0;
const LAT_N = 43.0;
const LON_W = -32.0;
const LON_E = -6.0;
const STEP = 0.006; // ~600 m — blocos visíveis ficam abaixo da leitura a zoom regional

const COLS = Math.ceil((LON_E - LON_W) / STEP);
const ROWS = Math.ceil((LAT_N - LAT_S) / STEP);
const LAND = new Uint8Array(COLS * ROWS);

for (const ring of LAND_RINGS) {
  for (let row = 0; row < ROWS; row++) {
    const y = LAT_S + (row + 0.5) * STEP;
    const xs: number[] = [];
    for (let i = 0, n = ring.length - 1; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if (y1 <= y !== y2 <= y) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // Centro da célula dentro do polígono — simétrico (~±1 km de erro de
      // borda, absorvido pelo blur do tile).
      const c0 = Math.max(0, Math.ceil((xs[k] - LON_W) / STEP - 0.5));
      const c1 = Math.min(COLS - 1, Math.floor((xs[k + 1] - LON_W) / STEP - 0.5));
      LAND.fill(1, row * COLS + c0, row * COLS + c1 + 1);
    }
  }
}

function gadmOnLand(lat: number, lon: number): boolean {
  if (lat < LAT_S || lat >= LAT_N || lon < LON_W || lon >= LON_E) return false;
  const col = Math.floor((lon - LON_W) / STEP);
  const row = Math.floor((lat - LAT_S) / STEP);
  return LAND[row * COLS + col] === 1;
}

// ── Lazy full-domain mask ───────────────────────────────────────────────────

export const LAND_MASK_PATH = '/data/land-mask.json';

export interface LandMask {
  west: number;
  south: number;
  step: number;
  cols: number;
  rows: number;
  /** rowStart[r]..rowStart[r+1] → transition columns of row r in `cols` */
  rowStart: Uint32Array;
  xs: Uint16Array;
}

function b64Bytes(s: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /* c8 ignore next */
  return new Uint8Array(Buffer.from(s, 'base64'));
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Decodes `land-mask.json` (v1). null when the shape does not match. */
export function parseLandMask(raw: unknown): LandMask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.runs !== 'string') return null;
  const { west, south, step, cols, rows } = r;
  if (!fin(west) || !fin(south) || !fin(step) || !fin(cols) || !fin(rows)) return null;
  if (step <= 0 || cols <= 0 || rows <= 0 || cols > 65535) return null;
  const bytes = b64Bytes(r.runs);
  const rowStart = new Uint32Array(rows + 1);
  const xs: number[] = [];
  let p = 0;
  const read = (): number => {
    let x = 0;
    let shift = 0;
    for (;;) {
      if (p >= bytes.length) throw new Error('eof');
      const b = bytes[p++];
      x |= (b & 0x7f) << shift;
      if (b < 0x80) return x;
      shift += 7;
    }
  };
  try {
    for (let row = 0; row < rows; row++) {
      rowStart[row] = xs.length;
      const n = read();
      let c = 0;
      for (let k = 0; k < n; k++) {
        c += read();
        if (c > cols) return null;
        xs.push(c);
      }
    }
  } catch {
    return null;
  }
  rowStart[rows] = xs.length;
  return { west, south, step, cols, rows, rowStart, xs: Uint16Array.from(xs) };
}

/** Even-odd lookup in a decoded mask; null outside its domain. */
export function landMaskAt(mask: LandMask, lat: number, lon: number): boolean | null {
  const col = Math.floor((lon - mask.west) / mask.step);
  const row = Math.floor((lat - mask.south) / mask.step);
  if (!(col >= 0 && col < mask.cols && row >= 0 && row < mask.rows)) return null;
  let lo = mask.rowStart[row];
  let hi = mask.rowStart[row + 1];
  // count of transitions ≤ col
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (mask.xs[mid] <= col) lo = mid + 1;
    else hi = mid;
  }
  return ((lo - mask.rowStart[row]) & 1) === 1;
}

let fullMask: LandMask | null = null;
let maskPromise: Promise<LandMask | null> | null = null;
let maskFailedAt = 0;
const listeners = new Set<() => void>();

/** Test hook / SSR-free install of a decoded mask. */
export function installLandMask(mask: LandMask | null): void {
  fullMask = mask;
  if (mask) for (const fn of listeners) fn();
}

export function isLandMaskReady(): boolean {
  return fullMask != null;
}

/** Called once when the full-domain mask arrives (fields repaint). */
export function onLandMaskReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Lazy-loads `land-mask.json` once (dedup). Never rejects: on failure the
 * bundled GADM raster keeps answering and a later call retries after 5 min.
 */
export function loadLandMask(): Promise<LandMask | null> {
  if (fullMask) return Promise.resolve(fullMask);
  if (maskPromise) return maskPromise;
  if (maskFailedAt && Date.now() - maskFailedAt < 5 * 60_000) return Promise.resolve(null);
  maskPromise = (async () => {
    try {
      const res = await fetch(getAssetPath(LAND_MASK_PATH));
      if (!res.ok) return null;
      return parseLandMask(await res.json());
    } catch {
      return null;
    }
  })().then((m) => {
    maskPromise = null;
    if (m) installLandMask(m);
    else maskFailedAt = Date.now();
    return m;
  });
  return maskPromise;
}

/**
 * True when the point sits on land. Full-domain mask when loaded (inside its
 * domain), otherwise the bundled GADM PT+ES raster.
 */
export function pointOnLand(lat: number, lon: number): boolean {
  if (fullMask) {
    const hit = landMaskAt(fullMask, lat, lon);
    if (hit != null) return hit;
  }
  return gadmOnLand(lat, lon);
}
