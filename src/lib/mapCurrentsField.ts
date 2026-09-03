import { currentAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_CURRENTS_LS_KEY } from '@/lib/map-constants';
import {
  fieldMaxDistKm,
  landAwareFalloff,
  distKm,
  isOceanFieldSpot,
  softenFieldCanvas,
  MAP_HS_BOUNDS,
  MAP_HS_PIXEL_SCALE,
  MAP_HS_STEP_DEG,
  MAP_HS_STEP_DEG_MOBILE,
  type FieldSpot,
} from '@/lib/mapHsField';

export { MAP_CURRENTS_LS_KEY, distKm, MAP_HS_BOUNDS as MAP_CURRENT_BOUNDS };

export const MAP_CURRENT_PANE = 'currents';
/** Above Hs (350), below Leaflet overlay/radar (400). */
export const MAP_CURRENT_PANE_Z = '360';

export const MAP_CURRENT_OPACITY = 0.96;
export const MAP_CURRENT_OPACITY_MOBILE = 0.82;
/** PT west-coast SMOC is typically 0.05–0.3 m/s; 0.4 m/s saturates the scale. */
export const MAP_CURRENT_SPEED_MAX = 0.4;
/** Seed stride for Jobard–Lefer filaments (cells). */
export const MAP_CURRENT_SEED_EVERY = 4;
export const MAP_CURRENT_SEED_EVERY_MOBILE = 5;

/** `--data-water` cyan-400. */
const CURRENT_RGB = { r: 34, g: 211, b: 238 } as const;

export interface CurrentSample {
  lat: number;
  lon: number;
  spd: number;
  dir: number;
}

export function uvFromSpdDir(spd: number, dir: number): { u: number; v: number } {
  const rad = (dir * Math.PI) / 180;
  return { u: spd * Math.sin(rad), v: spd * Math.cos(rad) };
}

export function dirFromUv(u: number, v: number): number {
  const deg = (Math.atan2(u, v) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function idwCurrentAt(
  samples: CurrentSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): { spd: number; dir: number; nearestKm: number; nearest: { lat: number; lon: number } } | null {
  if (!samples.length) return null;
  let numU = 0;
  let numV = 0;
  let den = 0;
  let nearest = Infinity;
  let nearestPt = samples[0];
  for (const s of samples) {
    const d = distKm({ lat, lon }, s);
    if (d < nearest) {
      nearest = d;
      nearestPt = s;
    }
    if (d > maxDistKm) continue;
    if (d < 0.05) return { spd: s.spd, dir: s.dir, nearestKm: d, nearest: { lat: s.lat, lon: s.lon } };
    const w = 1 / (d * d);
    const { u, v } = uvFromSpdDir(s.spd, s.dir);
    numU += u * w;
    numV += v * w;
    den += w;
  }
  if (den === 0 || nearest > maxDistKm) return null;
  const u = numU / den;
  const v = numV / den;
  const spd = Math.hypot(u, v);
  const nearestPos = { lat: nearestPt.lat, lon: nearestPt.lon };
  if (!(spd > 0.01)) return { spd: 0, dir: 0, nearestKm: nearest, nearest: nearestPos };
  return { spd, dir: dirFromUv(u, v), nearestKm: nearest, nearest: nearestPos };
}

export function idwCurrent(
  samples: CurrentSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): { spd: number; dir: number } | null {
  const at = idwCurrentAt(samples, lat, lon, maxDistKm);
  if (!at) return null;
  return { spd: at.spd, dir: at.dir };
}

export function currentFill(
  spd: number,
  opacityScale = 1,
): { r: number; g: number; b: number; a: number } {
  if (!(spd > 0.02)) return { ...CURRENT_RGB, a: 0 };
  const t = Math.min(1, spd / MAP_CURRENT_SPEED_MAX);
  return { ...CURRENT_RGB, a: (0.018 + t * 0.1) * opacityScale };
}

export function collectCurrentSamples(
  file: MapHoursFile | null | undefined,
  spots: FieldSpot[],
  index: number,
): CurrentSample[] {
  const out: CurrentSample[] = [];
  for (const spot of spots) {
    if (!isOceanFieldSpot(spot)) continue;
    const cur = currentAtHour(file, spot.id, index);
    if (!cur || cur.spd <= 0.02) continue;
    out.push({ lat: spot.lat, lon: spot.lon, spd: cur.spd, dir: cur.dir });
  }
  return out;
}

export function maxCurrentSpd(samples: CurrentSample[]): number {
  let m = 0;
  for (const s of samples) if (s.spd > m) m = s.spd;
  return m;
}

export interface CurrentFieldTile {
  id: string;
  url: string;
  bounds: [[number, number], [number, number]];
}

type CurrentCell = { u: number; v: number; spd: number; falloff: number };

function stampCell(
  img: ImageData,
  colsScale: number,
  x: number,
  y: number,
  scale: number,
  fill: { r: number; g: number; b: number; a: number },
): void {
  const a = Math.round(Math.min(1, Math.max(0, fill.a)) * 255);
  if (a <= 0) return;
  const w = colsScale;
  for (let sy = 0; sy < scale; sy++) {
    for (let sx = 0; sx < scale; sx++) {
      const i = ((y * scale + sy) * w + (x * scale + sx)) * 4;
      img.data[i] = fill.r;
      img.data[i + 1] = fill.g;
      img.data[i + 2] = fill.b;
      img.data[i + 3] = a;
    }
  }
}

function sampleCurrentGrid(
  grid: Array<CurrentCell | null>,
  cols: number,
  rows: number,
  fx: number,
  fy: number,
): CurrentCell | null {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 >= cols - 1 || y0 >= rows - 1) return null;
  const a = grid[y0 * cols + x0];
  const b = grid[y0 * cols + x0 + 1];
  const c = grid[(y0 + 1) * cols + x0];
  const d = grid[(y0 + 1) * cols + x0 + 1];
  const tx = fx - x0;
  const ty = fy - y0;
  if (!a || !b || !c || !d) {
    return (tx < 0.5 ? (ty < 0.5 ? a : c) : (ty < 0.5 ? b : d)) ?? null;
  }
  const s00 = (1 - tx) * (1 - ty);
  const s10 = tx * (1 - ty);
  const s01 = (1 - tx) * ty;
  const s11 = tx * ty;
  const u = a.u * s00 + b.u * s10 + c.u * s01 + d.u * s11;
  const v = a.v * s00 + b.v * s10 + c.v * s01 + d.v * s11;
  return {
    u,
    v,
    spd: Math.hypot(u, v),
    falloff: a.falloff * s00 + b.falloff * s10 + c.falloff * s01 + d.falloff * s11,
  };
}

function integrateFilament(
  grid: Array<CurrentCell | null>,
  cols: number,
  rows: number,
  x0: number,
  y0: number,
  steps: number,
  sign: 1 | -1,
): Array<{ x: number; y: number; spd: number }> {
  const pts: Array<{ x: number; y: number; spd: number }> = [];
  let x = x0;
  let y = y0;
  const step = 0.4;
  for (let i = 0; i < steps; i++) {
    const s = sampleCurrentGrid(grid, cols, rows, x, y);
    if (!s || s.spd < 0.028 || s.falloff < 0.32) break;
    pts.push({ x, y, spd: s.spd });
    const mag = Math.hypot(s.u, s.v);
    if (mag < 1e-5) break;
    const xMid = x + sign * (s.u / mag) * (step * 0.5);
    const yMid = y - sign * (s.v / mag) * (step * 0.5);
    const m = sampleCurrentGrid(grid, cols, rows, xMid, yMid) ?? s;
    const mm = Math.hypot(m.u, m.v);
    if (mm < 1e-5) break;
    x += sign * (m.u / mm) * step;
    y -= sign * (m.v / mm) * step;
    if (x < 0.6 || y < 0.6 || x > cols - 1.6 || y > rows - 1.6) break;
  }
  return pts;
}

function markOccupied(
  occ: Uint8Array,
  cols: number,
  rows: number,
  pts: Array<{ x: number; y: number }>,
  radius: number,
): void {
  const r = Math.max(1, Math.round(radius));
  const r2 = r * r;
  for (const p of pts) {
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < cols && y < rows) occ[y * cols + x] = 1;
      }
    }
  }
}

function drawFilament(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number; spd: number }>,
  scale: number,
): void {
  if (pts.length < 6) return;
  let spdSum = 0;
  for (const p of pts) spdSum += p.spd;
  const t = Math.min(1, spdSum / pts.length / MAP_CURRENT_SPEED_MAX);
  const last = pts.length - 1;
  ctx.save();
  for (let i = 0; i <= last; i++) {
    const along = i / last;
    const ease = along * along * (3 - 2 * along);
    const r = (0.45 + ease * (2.6 + t * 2.1)) * (0.85 + t * 0.25);
    const a = 0.08 + ease * (0.55 + t * 0.32);
    ctx.beginPath();
    ctx.arc(pts[i].x * scale, pts[i].y * scale, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(34 211 238 / ${a})`;
    ctx.fill();
  }
  const head = pts[last];
  const headR = 2.4 + t * 1.8;
  ctx.beginPath();
  ctx.arc(head.x * scale, head.y * scale, headR, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(34 211 238 / ${0.72 + t * 0.22})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(head.x * scale, head.y * scale, headR * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(241 245 249 / ${0.45 + t * 0.3})`;
  ctx.fill();
  ctx.restore();
}

export function renderCurrentFieldTiles(
  samples: CurrentSample[],
  opts: { mobile?: boolean; opacityScale?: number },
): CurrentFieldTile[] {
  if (typeof document === 'undefined' || !samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const seedEvery = opts.mobile ? MAP_CURRENT_SEED_EVERY_MOBILE : MAP_CURRENT_SEED_EVERY;
  const sep = opts.mobile ? 5.5 : 4.5;
  const fwdSteps = opts.mobile ? 16 : 24;
  const backSteps = opts.mobile ? 11 : 18;
  const opacityScale = opts.opacityScale ?? 1;
  const tiles: CurrentFieldTile[] = [];

  for (const box of MAP_HS_BOUNDS) {
    const maxDist = fieldMaxDistKm(box.id, opts.mobile);
    const pad = maxDist / 111;
    const nearby = samples.filter(
      (s) =>
        s.lat >= box.south - pad &&
        s.lat <= box.north + pad &&
        s.lon >= box.west - pad &&
        s.lon <= box.east + pad,
    );
    if (!nearby.length) continue;

    const cols = Math.max(2, Math.ceil((box.east - box.west) / step));
    const rows = Math.max(2, Math.ceil((box.north - box.south) / step));
    const scale = MAP_HS_PIXEL_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = cols * scale;
    canvas.height = rows * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    const grid: Array<CurrentCell | null> = new Array(cols * rows);
    const img = ctx.createImageData(cols * scale, rows * scale);
    const w = cols * scale;

    for (let y = 0; y < rows; y++) {
      const lat = box.north - ((y + 0.5) / rows) * (box.north - box.south);
      for (let x = 0; x < cols; x++) {
        const lon = box.west + ((x + 0.5) / cols) * (box.east - box.west);
        const at = idwCurrentAt(nearby, lat, lon, maxDist);
        if (!at || at.spd <= 0.02) {
          grid[y * cols + x] = null;
          continue;
        }
        const falloff = landAwareFalloff(lat, lon, at.nearest, at.nearestKm, maxDist, box.id);
        if (falloff <= 0.02) {
          grid[y * cols + x] = null;
          continue;
        }
        const { u, v } = uvFromSpdDir(at.spd, at.dir);
        grid[y * cols + x] = { u, v, spd: at.spd, falloff };
        stampCell(img, w, x, y, scale, currentFill(at.spd, opacityScale * falloff));
      }
    }

    ctx.putImageData(img, 0, 0);
    softenFieldCanvas(canvas, Math.max(0.8, scale * 0.3));

    const occ = new Uint8Array(cols * rows);
    const stagger = Math.max(1, Math.floor(seedEvery / 2));
    for (let y = seedEvery; y < rows - 1; y += seedEvery) {
      const xOff = (Math.floor(y / seedEvery) % 2) * stagger;
      for (let x = seedEvery + xOff; x < cols - 1; x += seedEvery) {
        if (occ[y * cols + x]) continue;
        const cur = grid[y * cols + x];
        if (!cur || cur.spd < 0.04 || cur.falloff < 0.5) continue;
        const x0 = x + 0.5;
        const y0 = y + 0.5;
        const fwd = integrateFilament(grid, cols, rows, x0, y0, fwdSteps, 1);
        const back = integrateFilament(grid, cols, rows, x0, y0, backSteps, -1);
        if (fwd.length + back.length < 6) continue;
        const backRev = back.slice(1).reverse();
        const pts = backRev.concat(fwd);
        drawFilament(ctx, pts, scale);
        markOccupied(occ, cols, rows, pts, sep);
      }
    }

    tiles.push({
      id: box.id,
      url: canvas.toDataURL('image/png'),
      bounds: [
        [box.south, box.west],
        [box.north, box.east],
      ],
    });
  }
  return tiles;
}
