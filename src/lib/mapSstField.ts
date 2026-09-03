import { sstAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_SST_LS_KEY } from '@/lib/map-constants';
import {
  fieldMaxDistKm,
  isOceanFieldSpot,
  landAwareFalloff,
  distKm,
  MAP_HS_BOUNDS,
  MAP_HS_PIXEL_SCALE,
  MAP_HS_STEP_DEG,
  MAP_HS_STEP_DEG_MOBILE,
  type FieldSpot,
  type HsBounds,
} from '@/lib/mapHsField';

export { MAP_SST_LS_KEY, distKm, MAP_HS_BOUNDS as MAP_SST_BOUNDS };
export type { FieldSpot, HsBounds };

export const MAP_SST_PANE = 'sst';
/** Below Hs (350) so the two never stack; currents filaments stay on top (360). */
export const MAP_SST_PANE_Z = '348';

export const MAP_SST_OPACITY = 0.88;
export const MAP_SST_OPACITY_MOBILE = 0.64;
/** Portugal west-coast SST: 14 °C winter north → 22 °C late-summer Algarve. */
export const MAP_SST_MIN = 14;
export const MAP_SST_MAX = 22;
/** Skip lake/error zeros; real Atlantic SST is never this cold. */
export const MAP_SST_SANE_MIN = 8;
export const MAP_SST_SANE_MAX = 32;

/** `--data-water` cyan-400 — cold end. */
const SST_COLD = { r: 34, g: 211, b: 238 } as const;
/** `--data-period` amber-400 — warm end. */
const SST_WARM = { r: 251, g: 191, b: 36 } as const;

export interface SstSample {
  lat: number;
  lon: number;
  sst: number;
}

export interface SstFieldTile {
  id: string;
  url: string;
  bounds: [[number, number], [number, number]];
}

export function sstNorm(sst: number): number {
  return Math.min(1, Math.max(0, (sst - MAP_SST_MIN) / (MAP_SST_MAX - MAP_SST_MIN)));
}

export function sstFill(
  sst: number,
  opacityScale = 1,
): { r: number; g: number; b: number; a: number } {
  if (!(sst >= MAP_SST_SANE_MIN) || sst > MAP_SST_SANE_MAX) {
    return { ...SST_COLD, a: 0 };
  }
  const t = sstNorm(sst);
  // Hold `--data-water` through typical west-coast 16–18 °C. Linear RGB
  // cyan→amber would pass through olive at the midpoint — unreadable and
  // not Atlantic. Amber only on the warm tail (Algarve / late summer).
  const u = t <= 0.45 ? 0 : (t - 0.45) / 0.55;
  const s = u * u * (3 - 2 * u);
  return {
    r: Math.round(SST_COLD.r + (SST_WARM.r - SST_COLD.r) * s),
    g: Math.round(SST_COLD.g + (SST_WARM.g - SST_COLD.g) * s),
    b: Math.round(SST_COLD.b + (SST_WARM.b - SST_COLD.b) * s),
    a: (0.24 + t * 0.52) * opacityScale,
  };
}

export function idwSstAt(
  samples: SstSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): { sst: number; nearestKm: number; nearest: { lat: number; lon: number } } | null {
  if (!samples.length) return null;
  let num = 0;
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
    if (d < 0.05) return { sst: s.sst, nearestKm: d, nearest: { lat: s.lat, lon: s.lon } };
    const w = 1 / (d * d);
    num += s.sst * w;
    den += w;
  }
  if (den === 0 || nearest > maxDistKm) return null;
  return { sst: num / den, nearestKm: nearest, nearest: { lat: nearestPt.lat, lon: nearestPt.lon } };
}

export function idwSst(
  samples: SstSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): number | null {
  return idwSstAt(samples, lat, lon, maxDistKm)?.sst ?? null;
}

export function collectSstSamples(
  file: MapHoursFile | null | undefined,
  spots: FieldSpot[],
  index: number,
): SstSample[] {
  const out: SstSample[] = [];
  for (const spot of spots) {
    if (!isOceanFieldSpot(spot)) continue;
    const sst = sstAtHour(file, spot.id, index);
    if (sst == null || sst < MAP_SST_SANE_MIN || sst > MAP_SST_SANE_MAX) continue;
    out.push({ lat: spot.lat, lon: spot.lon, sst });
  }
  return out;
}

export function maxSst(samples: SstSample[]): number {
  let m = 0;
  for (const s of samples) if (s.sst > m) m = s.sst;
  return m;
}

function softenFieldCanvas(canvas: HTMLCanvasElement, radiusPx: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || radiusPx <= 0) return;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  tctx.filter = `blur(${radiusPx}px)`;
  tctx.drawImage(canvas, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0);
}

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

export function renderSstFieldTiles(
  samples: SstSample[],
  opts: { mobile?: boolean; opacityScale?: number },
): SstFieldTile[] {
  if (typeof document === 'undefined' || !samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const opacityScale = opts.opacityScale ?? 1;
  const tiles: SstFieldTile[] = [];

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
    const img = ctx.createImageData(cols * scale, rows * scale);
    const w = cols * scale;

    for (let y = 0; y < rows; y++) {
      const lat = box.north - ((y + 0.5) / rows) * (box.north - box.south);
      for (let x = 0; x < cols; x++) {
        const lon = box.west + ((x + 0.5) / cols) * (box.east - box.west);
        const at = idwSstAt(nearby, lat, lon, maxDist);
        if (!at) continue;
        const falloff = landAwareFalloff(lat, lon, at.nearest, at.nearestKm, maxDist, box.id);
        if (falloff <= 0.02) continue;
        stampCell(img, w, x, y, scale, sstFill(at.sst, opacityScale * falloff));
      }
    }
    ctx.putImageData(img, 0, 0);
    softenFieldCanvas(canvas, Math.max(1.2, scale * 0.42));
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
