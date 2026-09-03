import { currentAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_CURRENTS_LS_KEY } from '@/lib/map-constants';
import {
  fieldMaxDistKm,
  landAwareFalloff,
  distKm,
  isOceanFieldSpot,
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
export const MAP_CURRENT_ARROW_EVERY = 8;
export const MAP_CURRENT_ARROW_EVERY_MOBILE = 7;

/** `--data-water` (cyan-400) wash is unused on the map — arrows only. */
const CURRENT_RGB = { r: 34, g: 211, b: 238 } as const;
const ARROW_INK = 'rgb(2 6 23 / 0.78)';
const ARROW_ICE = 'rgb(241 245 249 / 0.96)';

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
  return { ...CURRENT_RGB, a: (0.03 + t * 0.22) * opacityScale };
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

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  len: number,
  stroke: string,
  width: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 180);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(0, len * 0.42);
  ctx.lineTo(0, -len * 0.58);
  ctx.moveTo(-len * 0.28, -len * 0.18);
  ctx.lineTo(0, -len * 0.58);
  ctx.lineTo(len * 0.28, -len * 0.18);
  ctx.stroke();
  ctx.restore();
}

export function renderCurrentFieldTiles(
  samples: CurrentSample[],
  opts: { mobile?: boolean; opacityScale?: number },
): CurrentFieldTile[] {
  if (typeof document === 'undefined' || !samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const arrowEvery = opts.mobile ? MAP_CURRENT_ARROW_EVERY_MOBILE : MAP_CURRENT_ARROW_EVERY;
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
    const grid: Array<{ spd: number; dir: number; falloff: number } | null> = new Array(cols * rows);

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
        grid[y * cols + x] = { spd: at.spd, dir: at.dir, falloff };
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const arrowLen = 3.55 * scale;
    const stagger = Math.max(2, Math.floor(arrowEvery / 2));
    for (let y = arrowEvery; y < rows - 1; y += arrowEvery) {
      const x0 = (Math.floor(y / arrowEvery) % 2) * stagger;
      for (let x = arrowEvery + x0; x < cols - 1; x += arrowEvery) {
        const cur = grid[y * cols + x];
        if (!cur || cur.spd < 0.04 || cur.falloff < 0.58) continue;
        const px = (x + 0.5) * scale;
        const py = (y + 0.5) * scale;
        const len = arrowLen * (0.58 + 0.42 * Math.min(1, cur.spd / MAP_CURRENT_SPEED_MAX));
        drawArrow(ctx, px, py, cur.dir, len, ARROW_INK, 2.05);
        drawArrow(ctx, px, py, cur.dir, len, ARROW_ICE, 1.15);
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
