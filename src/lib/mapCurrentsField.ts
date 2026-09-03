import { currentAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_CURRENTS_LS_KEY } from '@/lib/map-constants';
import {
  distKm,
  MAP_HS_BOUNDS,
  MAP_HS_MAX_DIST_KM,
  MAP_HS_MAX_DIST_KM_MOBILE,
  MAP_HS_PIXEL_SCALE,
  MAP_HS_STEP_DEG,
  MAP_HS_STEP_DEG_MOBILE,
} from '@/lib/mapHsField';

export { MAP_CURRENTS_LS_KEY, distKm, MAP_HS_BOUNDS as MAP_CURRENT_BOUNDS };

export const MAP_CURRENT_PANE = 'currents';
/** Above Hs (350), below Leaflet overlay/radar (400). */
export const MAP_CURRENT_PANE_Z = '360';

export const MAP_CURRENT_OPACITY = 0.72;
export const MAP_CURRENT_OPACITY_MOBILE = 0.45;
/** PT west-coast SMOC is typically 0.05–0.3 m/s; 0.4 m/s saturates the fill. */
export const MAP_CURRENT_SPEED_MAX = 0.4;
export const MAP_CURRENT_ARROW_EVERY = 5;
export const MAP_CURRENT_ARROW_EVERY_MOBILE = 4;

/** `--data-water` light (cyan-400). Distinct from Hs `--data-waves` sky-500. */
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

export function idwCurrent(
  samples: CurrentSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): { spd: number; dir: number } | null {
  if (!samples.length) return null;
  let numU = 0;
  let numV = 0;
  let den = 0;
  let nearest = Infinity;
  for (const s of samples) {
    const d = distKm({ lat, lon }, s);
    if (d < nearest) nearest = d;
    if (d > maxDistKm) continue;
    if (d < 0.05) return { spd: s.spd, dir: s.dir };
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
  if (!(spd > 0.01)) return { spd: 0, dir: 0 };
  return { spd, dir: dirFromUv(u, v) };
}

export function currentFill(
  spd: number,
  opacityScale = 1,
): { r: number; g: number; b: number; a: number } {
  if (!(spd > 0.02)) return { ...CURRENT_RGB, a: 0 };
  const t = Math.min(1, spd / MAP_CURRENT_SPEED_MAX);
  return { ...CURRENT_RGB, a: (0.1 + t * 0.55) * opacityScale };
}

export function collectCurrentSamples(
  file: MapHoursFile | null | undefined,
  spots: Array<{ id: string; lat: number; lon: number }>,
  index: number,
): CurrentSample[] {
  const out: CurrentSample[] = [];
  for (const spot of spots) {
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
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, len * 0.35);
  ctx.lineTo(0, -len);
  ctx.moveTo(-len * 0.35, -len + len * 0.45);
  ctx.lineTo(0, -len);
  ctx.lineTo(len * 0.35, -len + len * 0.45);
  ctx.stroke();
  ctx.restore();
}

export function renderCurrentFieldTiles(
  samples: CurrentSample[],
  opts: { mobile?: boolean; opacityScale?: number },
): CurrentFieldTile[] {
  if (typeof document === 'undefined' || !samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const maxDist = opts.mobile ? MAP_HS_MAX_DIST_KM_MOBILE : MAP_HS_MAX_DIST_KM;
  const opacityScale = opts.opacityScale ?? 1;
  const arrowEvery = opts.mobile ? MAP_CURRENT_ARROW_EVERY_MOBILE : MAP_CURRENT_ARROW_EVERY;
  const tiles: CurrentFieldTile[] = [];

  for (const box of MAP_HS_BOUNDS) {
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
    const img = ctx.createImageData(cols * scale, rows * scale);
    const w = cols * scale;
    const grid: Array<{ spd: number; dir: number } | null> = new Array(cols * rows);

    for (let y = 0; y < rows; y++) {
      const lat = box.north - ((y + 0.5) / rows) * (box.north - box.south);
      for (let x = 0; x < cols; x++) {
        const lon = box.west + ((x + 0.5) / cols) * (box.east - box.west);
        const cur = idwCurrent(nearby, lat, lon, maxDist);
        grid[y * cols + x] = cur;
        const fill = currentFill(cur?.spd ?? 0, opacityScale);
        const a = Math.round(Math.min(1, fill.a) * 255);
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
    }
    ctx.putImageData(img, 0, 0);

    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '248 250 252';
    ctx.strokeStyle = `rgb(${fg} / 0.9)`;
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const arrowLen = 3.2 * scale;
    for (let y = arrowEvery; y < rows - 1; y += arrowEvery) {
      for (let x = arrowEvery; x < cols - 1; x += arrowEvery) {
        const cur = grid[y * cols + x];
        if (!cur || cur.spd < 0.04) continue;
        const px = (x + 0.5) * scale;
        const py = (y + 0.5) * scale;
        const len = arrowLen * (0.55 + 0.45 * Math.min(1, cur.spd / MAP_CURRENT_SPEED_MAX));
        drawArrow(ctx, px, py, cur.dir, len);
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
