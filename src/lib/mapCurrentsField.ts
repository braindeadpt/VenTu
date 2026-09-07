import { currentAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_CURRENTS_LS_KEY } from '@/lib/map-constants';
import {
  fieldMaxDistKm,
  landAwareFalloff,
  distKm,
  isOceanFieldSpot,
  MAP_HS_BOUNDS,
  MAP_HS_STEP_DEG,
  MAP_HS_STEP_DEG_MOBILE,
  MAINLAND_INLAND,
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
/** Aim this many CSS pixels between ticks — stays sharp at every zoom. */
export const MAP_CURRENT_TICK_PX = 12;
export const MAP_CURRENT_TICK_PX_MOBILE = 15;
export const MAP_CURRENT_TICK_LIMIT = 2500;

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

export function isOpenOceanCurrentSpot(spot: Pick<FieldSpot, 'type' | 'bestSwell'>): boolean {
  if (!isOceanFieldSpot(spot)) return false;
  const swell = (spot.bestSwell ?? '').toLowerCase();
  if (swell.includes('oceano')) return true;
  return !/(rio|estu[aá]rio|douro|\btejo\b|\bria\b)/i.test(swell);
}

export function currentTickOnWater(
  lat: number,
  lon: number,
  nearest: { lat: number; lon: number },
  falloff: number,
  tileId: string,
): boolean {
  if (falloff < 0.62) return false;
  if (tileId !== 'mainland') return true;
  const dCell = distKm({ lat, lon }, MAINLAND_INLAND);
  const dCoast = distKm(nearest, MAINLAND_INLAND);
  if (dCell < dCoast - 0.25) return false;
  // West coast: land is east of the beach. South Algarve: land is north.
  if (nearest.lat > 37.15 && nearest.lon < -8.6 && lon > nearest.lon + 0.012) return false;
  if (nearest.lat < 37.15 && lat > nearest.lat + 0.012) return false;
  return true;
}

export function collectCurrentSamples(
  file: MapHoursFile | null | undefined,
  spots: FieldSpot[],
  index: number,
): CurrentSample[] {
  const out: CurrentSample[] = [];
  for (const spot of spots) {
    if (!isOpenOceanCurrentSpot(spot)) continue;
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

export interface CurrentParticle {
  lat: number;
  lon: number;
  spd: number;
  dir: number;
}

type CurrentCell = {
  u: number;
  v: number;
  spd: number;
  falloff: number;
  nlat: number;
  nlon: number;
};

export interface CurrentFieldGrid {
  id: string;
  south: number;
  west: number;
  north: number;
  east: number;
  cols: number;
  rows: number;
  grid: Array<CurrentCell | null>;
}

export interface CurrentTickMetrics {
  length: number;
  width: number;
  alpha: number;
  head: number;
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
    nlat: a.nlat,
    nlon: a.nlon,
  };
}

function sampleGridAtLonLat(g: CurrentFieldGrid, lat: number, lon: number): CurrentCell | null {
  const spanX = g.east - g.west;
  const spanY = g.north - g.south;
  if (!(spanX > 0) || !(spanY > 0)) return null;
  const fx = ((lon - g.west) / spanX) * g.cols - 0.5;
  const fy = ((g.north - lat) / spanY) * g.rows - 0.5;
  return sampleCurrentGrid(g.grid, g.cols, g.rows, fx, fy);
}

function hash01(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Geographic spacing so neighbouring ticks sit ~12 px apart at this zoom.
 * Clamped so country view stays readable and close-up does not explode.
 */
export function currentParticleStepDeg(zoom: number, mobile = false): number {
  const z = Math.max(4, Math.min(14, zoom));
  const targetPx = mobile ? MAP_CURRENT_TICK_PX_MOBILE : MAP_CURRENT_TICK_PX;
  const mPerPx = (156543.03392 * Math.cos((39 * Math.PI) / 180)) / 2 ** z;
  const deg = (mPerPx * targetPx) / 111320;
  return Math.min(0.18, Math.max(0.018, deg));
}

export function currentTickMetrics(spd: number): CurrentTickMetrics {
  const t = Math.min(1, Math.max(0, spd / MAP_CURRENT_SPEED_MAX));
  return {
    length: 3.2 + t * 5.2,
    width: 1.15 + t * 0.7,
    alpha: 0.4 + t * 0.5,
    head: 1.05 + t * 0.55,
  };
}

export function buildCurrentFieldGrids(
  samples: CurrentSample[],
  opts: { mobile?: boolean } = {},
): CurrentFieldGrid[] {
  if (!samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const out: CurrentFieldGrid[] = [];

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
    const grid: Array<CurrentCell | null> = new Array(cols * rows);

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
        if (!currentTickOnWater(lat, lon, at.nearest, falloff, box.id)) {
          grid[y * cols + x] = null;
          continue;
        }
        const { u, v } = uvFromSpdDir(at.spd, at.dir);
        grid[y * cols + x] = {
          u,
          v,
          spd: at.spd,
          falloff,
          nlat: at.nearest.lat,
          nlon: at.nearest.lon,
        };
      }
    }

    out.push({
      id: box.id,
      south: box.south,
      west: box.west,
      north: box.north,
      east: box.east,
      cols,
      rows,
      grid,
    });
  }
  return out;
}

export function collectCurrentParticles(
  grids: CurrentFieldGrid[],
  view: { south: number; west: number; north: number; east: number },
  stepDeg: number,
  limit = MAP_CURRENT_TICK_LIMIT,
): CurrentParticle[] {
  const out: CurrentParticle[] = [];
  if (!(stepDeg > 0) || stepDeg > 5) return out;

  let steps = 0;
  const maxSteps = 8000;
  for (const g of grids) {
    const south = Math.max(g.south, view.south);
    const north = Math.min(g.north, view.north);
    const west = Math.max(g.west, view.west);
    const east = Math.min(g.east, view.east);
    if (south >= north || west >= east) continue;

    const lat0 = Math.ceil(south / stepDeg) * stepDeg;
    for (let lat = lat0; lat <= north; lat += stepDeg) {
      const row = Math.round(lat / stepDeg);
      const lonOff = (row % 2) * (stepDeg * 0.5);
      const lon0 = Math.ceil((west - lonOff) / stepDeg) * stepDeg + lonOff;
      for (let lon = lon0; lon <= east; lon += stepDeg) {
        if (++steps > maxSteps) return out;
        const jLat = (hash01(lat, lon) - 0.5) * stepDeg * 0.22;
        const jLon = (hash01(lon, lat) - 0.5) * stepDeg * 0.22;
        const slat = lat + jLat;
        const slon = lon + jLon;
        const cell = sampleGridAtLonLat(g, slat, slon);
        if (!cell || cell.spd < 0.028) continue;
        if (
          !currentTickOnWater(slat, slon, { lat: cell.nlat, lon: cell.nlon }, cell.falloff, g.id)
        ) {
          continue;
        }
        out.push({ lat: slat, lon: slon, spd: cell.spd, dir: dirFromUv(cell.u, cell.v) });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export function drawCurrentTicks(
  ctx: CanvasRenderingContext2D,
  particles: CurrentParticle[],
  project: (lat: number, lon: number) => { x: number; y: number },
  colors: { water: string; halo: string },
  opacityScale = 1,
  view?: { width: number; height: number },
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const maxX = view ? view.width + 6 : 8192;
  const maxY = view ? view.height + 6 : 8192;
  for (const p of particles) {
    const { x, y } = project(p.lat, p.lon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < -6 || y < -6 || x > maxX || y > maxY) continue;
    const m = currentTickMetrics(p.spd);
    const rad = (p.dir * Math.PI) / 180;
    const dx = Math.sin(rad) * m.length;
    const dy = -Math.cos(rad) * m.length;
    const x0 = x - dx * 0.35;
    const y0 = y - dy * 0.35;
    const x1 = x + dx * 0.65;
    const y1 = y + dy * 0.65;
    const alpha = m.alpha * opacityScale;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = `rgb(${colors.halo} / ${Math.min(0.55, alpha * 0.7)})`;
    ctx.lineWidth = m.width + 1.35;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = `rgb(${colors.water} / ${alpha})`;
    ctx.lineWidth = m.width;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x1, y1, m.head, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${colors.water} / ${Math.min(1, alpha + 0.12)})`;
    ctx.fill();
  }
}
