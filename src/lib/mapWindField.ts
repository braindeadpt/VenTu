import { windAtHour, type MapHoursFile } from '@/lib/mapHours';
import { pointOnLand } from '@/lib/landMask';
import {
  idwCurrentAt,
  prepareCurrentSamples,
  uvFromSpdDir,
  type CurrentSample,
} from '@/lib/mapCurrentsField';
import {
  distKm,
  isOceanFieldSpot,
  landAwareFalloff,
  MAINLAND_INLAND,
  MAP_HS_BOUNDS,
  MAP_HS_STEP_DEG,
  MAP_HS_STEP_DEG_MOBILE,
  type FieldSpot,
} from '@/lib/mapHsField';

export const MAP_WIND_PANE = 'windfield';
/** Ambient layer — below Hs (350) and currents (360), above tiles. */
export const MAP_WIND_PANE_Z = '345';

/**
 * Alcance do campo de vento por região. O vento é regional — nas ilhas cobre
 * o arquipélago inteiro (~110 km) e funde-se num campo contínuo em vez de
 * discos à volta de cada ilha; no mainland a banda costeira vai ~55 km.
 */
export const MAP_WIND_MAX_DIST_KM = 80;
export const MAP_WIND_MAX_DIST_KM_MOBILE = 60;
export const MAP_WIND_MAX_DIST_KM_ISLAND = 400;
export const MAP_WIND_MAX_DIST_KM_ISLAND_MOBILE = 300;

export function windMaxDistKm(tileId: string, mobile = false): number {
  if (tileId === 'azores' || tileId === 'madeira') {
    return mobile ? MAP_WIND_MAX_DIST_KM_ISLAND_MOBILE : MAP_WIND_MAX_DIST_KM_ISLAND;
  }
  return mobile ? MAP_WIND_MAX_DIST_KM_MOBILE : MAP_WIND_MAX_DIST_KM;
}

/** Particle budget — density ∝ kt via rejection spawn does the rest. */
export const MAP_WIND_PARTICLES = 460;
export const MAP_WIND_PARTICLES_MOBILE = 160;
/**
 * Trail persistence per frame (destination-in alpha kept). 0.962 davia
 * trails de ~2 s — com 460 partículas a soma tornava-se uma névoa clara
 * sobre a banda inteira; 0.95 mantém o rasto mas seca o brilho ambiente.
 */
export const MAP_WIND_FADE = 0.93;
/**
 * Visual speed in screen px/s per m/s — advection is normalized by
 * meters-per-pixel so trails keep a consistent on-screen length at any zoom
 * (10 m/s ≈ 2.7 px/frame @60fps → ~120 px trail; 3 m/s → curto e lento).
 */
export const MAP_WIND_PX_PER_S_PER_MS = 16;
/** Min wind to participate (m/s). */
export const MAP_WIND_MIN_MS = 0.6;

export interface WindSample {
  lat: number;
  lon: number;
  /** m/s */
  spd: number;
  /** azimuth the wind blows TOWARD (forecast dir is FROM → +180) */
  dirTo: number;
}

export interface WindParticle {
  lat: number;
  lon: number;
  /** previous container-px — set by the draw loop each frame */
  px: number;
  py: number;
  hasPrev: boolean;
  life: number;
  /** kt — fixed at spawn so strength reads stably */
  kt: number;
  /** per-particle speed factor — breaks the laser-parallel look */
  jit: number;
}

/** Célula mínima partilhada por qualquer campo de fluxo (vento, correntes…). */
export interface FlowCell {
  u: number;
  v: number;
  spd: number;
  falloff: number;
  nlat: number;
  nlon: number;
}

export interface FlowFieldGrid {
  id: string;
  south: number;
  west: number;
  north: number;
  east: number;
  cols: number;
  rows: number;
  grid: Array<FlowCell | null>;
}

type WindCell = FlowCell & { kt: number };

export interface WindFieldGrid extends FlowFieldGrid {
  grid: Array<WindCell | null>;
}

const MS_TO_KT = 1.943844;

/** windDirection is meteorological FROM; the field advects TOWARD. */
/**
 * Máscara de água para o campo de vento — mais permissiva no mar aberto que
 * a dos ticks de corrente (falloff 0.08 vs 0.62) e mais restritiva em terra:
 * a costa oeste corta células a leste do spot mais próximo, o Algarve corta
 * as a norte; o interior profundo sai pela distância ao ponto de referência.
 */
export function windCellOnWater(
  lat: number,
  lon: number,
  nearest: { lat: number; lon: number },
  falloff: number,
  tileId: string,
): boolean {
  if (pointOnLand(lat, lon)) return false;
  if (falloff < 0.08) return false;
  if (tileId !== 'mainland') return true;
  // ~5 km de tolerância — os spots de praia já vivem 0–2 km para dentro
  const eps = 0.055;
  if (nearest.lat > 37.15) {
    if (lon > nearest.lon + eps) return false;
  } else if (lon > -9.05 && lat > nearest.lat + eps) return false;
  const dCell = distKm({ lat, lon }, MAINLAND_INLAND);
  const dCoast = distKm(nearest, MAINLAND_INLAND);
  if (dCell < dCoast - 3) return false;
  return true;
}

export function collectWindSamples(
  file: MapHoursFile | null | undefined,
  spots: FieldSpot[],
  index: number,
): CurrentSample[] {
  const out: CurrentSample[] = [];
  for (const spot of spots) {
    if (!isOceanFieldSpot(spot)) continue;
    const w = windAtHour(file, spot.id, index);
    if (!w || w.spd < MAP_WIND_MIN_MS) continue;
    const dirTo = (w.dir + 180) % 360;
    out.push({ lat: spot.lat, lon: spot.lon, spd: w.spd, dir: dirTo });
  }
  return out;
}

function sampleGrid(
  grid: Array<FlowCell | null>,
  cols: number,
  rows: number,
  fx: number,
  fy: number,
): FlowCell | null {
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
  const falloff = a.falloff * s00 + b.falloff * s10 + c.falloff * s01 + d.falloff * s11;
  const spd = Math.hypot(u, v);
  return { u, v, spd, falloff, nlat: a.nlat, nlon: a.nlon };
}

export function windCellAt(g: FlowFieldGrid, lat: number, lon: number): FlowCell | null {
  const spanX = g.east - g.west;
  const spanY = g.north - g.south;
  if (!(spanX > 0) || !(spanY > 0)) return null;
  const fx = ((lon - g.west) / spanX) * g.cols - 0.5;
  const fy = ((g.north - lat) / spanY) * g.rows - 0.5;
  return sampleGrid(g.grid, g.cols, g.rows, fx, fy);
}

export function windCellAnywhere(
  grids: FlowFieldGrid[],
  lat: number,
  lon: number,
): { cell: FlowCell; grid: FlowFieldGrid } | null {
  for (const g of grids) {
    if (lat < g.south || lat > g.north || lon < g.west || lon > g.east) continue;
    const cell = windCellAt(g, lat, lon);
    if (cell) return { cell, grid: g };
  }
  return null;
}

export function buildWindFieldGrids(
  samples: CurrentSample[],
  opts: { mobile?: boolean } = {},
): WindFieldGrid[] {
  if (!samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const out: WindFieldGrid[] = [];
  const prepped = prepareCurrentSamples(samples);

  for (const box of MAP_HS_BOUNDS) {
    const maxDist = windMaxDistKm(box.id, opts.mobile);
    const pad = maxDist / 111;
    // Grelha alargada pelo alcance — o campo esmorece antes da borda da box
    // em vez de cortar numa linha recta. O passo coarsens com a grelha
    // alargada para o build não escalar com o pad (~180 colunas no máx.).
    const gbox = {
      south: box.south - pad,
      west: box.west - pad,
      north: box.north + pad,
      east: box.east + pad,
    };
    const gstep = Math.max(step, (gbox.east - gbox.west) / 180);
    const nearby = prepped.filter(
      (s) =>
        s.lat >= box.south - pad &&
        s.lat <= box.north + pad &&
        s.lon >= box.west - pad &&
        s.lon <= box.east + pad,
    );
    if (!nearby.length) continue;

    const cols = Math.max(2, Math.ceil((gbox.east - gbox.west) / gstep));
    const rows = Math.max(2, Math.ceil((gbox.north - gbox.south) / gstep));
    const grid: Array<WindCell | null> = new Array(cols * rows);

    for (let y = 0; y < rows; y++) {
      const lat = gbox.north - ((y + 0.5) / rows) * (gbox.north - gbox.south);
      for (let x = 0; x < cols; x++) {
        const lon = gbox.west + ((x + 0.5) / cols) * (gbox.east - gbox.west);
        if (pointOnLand(lat, lon)) {
          grid[y * cols + x] = null;
          continue;
        }
        const at = idwCurrentAt(nearby, lat, lon, maxDist);
        if (!at || at.spd < MAP_WIND_MIN_MS) {
          grid[y * cols + x] = null;
          continue;
        }
        const falloff = landAwareFalloff(lat, lon, at.nearest, at.nearestKm, maxDist, box.id);
        if (falloff <= 0.05) {
          grid[y * cols + x] = null;
          continue;
        }
        if (!windCellOnWater(lat, lon, at.nearest, falloff, box.id)) {
          grid[y * cols + x] = null;
          continue;
        }
        const { u, v } = uvFromSpdDir(at.spd, at.dir);
        grid[y * cols + x] = {
          u,
          v,
          spd: at.spd,
          kt: at.spd * MS_TO_KT,
          falloff,
          nlat: at.nearest.lat,
          nlon: at.nearest.lon,
        };
      }
    }

    out.push({ id: box.id, south: gbox.south, west: gbox.west, north: gbox.north, east: gbox.east, cols, rows, grid });
  }
  return out;
}

/**
 * Rejection spawn — density ∝ strength·falloff: strong cells get more
 * particles, weak ones stay airy. `view` limits spawn to the viewport.
 * `strengthOf` maps a cell to the 0–~20 scale the visuals expect
 * (vento: kt reais; correntes: normalizado 0–16).
 */
export function spawnWindParticle(
  grids: FlowFieldGrid[],
  view: { south: number; west: number; north: number; east: number },
  out: WindParticle,
  rand: () => number = Math.random,
  strengthOf: (cell: FlowCell) => number = (c) => c.spd * MS_TO_KT,
): WindParticle | null {
  for (let tries = 0; tries < 24; tries++) {
    const lat = view.south + rand() * (view.north - view.south);
    const lon = view.west + rand() * (view.east - view.west);
    const hit = windCellAnywhere(grids, lat, lon);
    if (!hit) continue;
    const { cell } = hit;
    const strength = strengthOf(cell);
    // acceptance ∝ strength com chão — fluxo fraco ainda lê como movimento
    // suave (poucas partículas), fluxo forte fica denso
    const p = 0.3 + Math.min(0.7, (strength * cell.falloff) / 15);
    if (rand() > p) continue;
    out.lat = lat;
    out.lon = lon;
    out.hasPrev = false;
    out.life = 80 + Math.floor(rand() * 140);
    out.kt = strength;
    out.jit = 0.75 + rand() * 0.5;
    return out;
  }
  return null;
}

/** Web-mercator meters per pixel at `lat`/`zoom`. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/**
 * Advect one particle by `dtSec` of visual time. `zoom` normalizes the
 * movement to screen px so trail length doesn't blow up when zooming in.
 * Returns false when the particle must be respawned (left the field / expired).
 */
export function advectWindParticle(
  grids: FlowFieldGrid[],
  p: WindParticle,
  dtSec: number,
  zoom: number,
  pxPerMs = MAP_WIND_PX_PER_S_PER_MS,
): boolean {
  const hit = windCellAnywhere(grids, p.lat, p.lon);
  if (!hit || hit.cell.falloff < 0.08) return false;
  const { cell } = hit;
  const cosLat = Math.max(0.35, Math.cos((p.lat * Math.PI) / 180));
  // m/s → m/s visuais: v_px = spd · K  →  m = v_px · mpp  →  deg
  const mPerPx = metersPerPixel(p.lat, zoom);
  const deg = (pxPerMs * dtSec * mPerPx * p.jit) / 111320;
  p.lon += (cell.u * deg) / cosLat;
  p.lat += cell.v * deg;
  // leve difusão — quebra trajectórias idênticas entre vizinhos
  p.lat += (Math.random() - 0.5) * deg * 0.35;
  p.lon += (Math.random() - 0.5) * deg * 0.35;
  p.life--;
  return p.life > 0;
}

/**
 * Segment prev→now per particle; the hook owns the frame-fade so trails are
 * continuous. `color` is an 'r,g,b' token already resolved for the theme.
 */
export function drawWindParticles(
  ctx: CanvasRenderingContext2D,
  particles: WindParticle[],
  project: (lat: number, lon: number) => { x: number; y: number },
  color: string,
  opacityScale = 1,
  view?: { width: number; height: number },
): void {
  ctx.lineCap = 'round';
  const maxX = view ? view.width + 8 : 8192;
  const maxY = view ? view.height + 8 : 8192;
  for (const p of particles) {
    const pt = project(p.lat, p.lon);
    if (p.hasPrev) {
      const x = pt.x;
      const y = pt.y;
      if (x > -8 && y > -8 && x < maxX && y < maxY) {
        const a = Math.min(0.72, 0.26 + p.kt / 40) * opacityScale;
        ctx.strokeStyle = `rgb(${color} / ${a.toFixed(3)})`;
        ctx.lineWidth = p.kt > 15 ? 1.7 : 1.15;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    p.px = pt.x;
    p.py = pt.y;
    p.hasPrev = true;
  }
}
