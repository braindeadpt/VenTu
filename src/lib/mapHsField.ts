import { hsAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_HS_LS_KEY } from '@/lib/map-constants';

export { MAP_HS_LS_KEY };
export const MAP_HS_PANE = 'hs';
/** Below Leaflet overlay pane (400) so radar sits on top; under markers (600). */
export const MAP_HS_PANE_Z = '350';

export const MAP_HS_MAX_DIST_KM = 80;
export const MAP_HS_MAX_DIST_KM_MOBILE = 55;
/** ~7 km on the mainland — coarse enough to stay cheap, fine enough not to look like coins. */
export const MAP_HS_STEP_DEG = 0.07;
export const MAP_HS_STEP_DEG_MOBILE = 0.12;
/** Extra canvas pixels per IDW cell so Leaflet stretch stays smooth. */
export const MAP_HS_PIXEL_SCALE = 2;
export const MAP_HS_OPACITY = 0.85;
export const MAP_HS_OPACITY_MOBILE = 0.5;

/** Atlantic cyan — `--data-waves` light (sky-500). */
const HS_RGB = { r: 14, g: 165, b: 233 } as const;

export interface HsSample {
  lat: number;
  lon: number;
  hs: number;
}

export interface HsBounds {
  id: string;
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Coarse tiles covering the coast — not a 1 km Atlantic mesh. */
export const MAP_HS_BOUNDS: readonly HsBounds[] = [
  { id: 'mainland', south: 36.9, west: -9.75, north: 42.2, east: -6.15 },
  { id: 'azores', south: 36.9, west: -31.4, north: 39.8, east: -24.9 },
  { id: 'madeira', south: 32.35, west: -17.35, north: 33.15, east: -16.25 },
];

export function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Inverse-distance weighting. `null` when every sample is beyond `maxDistKm`. */
export function idwHs(
  samples: HsSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): number | null {
  if (!samples.length) return null;
  let num = 0;
  let den = 0;
  let nearest = Infinity;
  for (const s of samples) {
    const d = distKm({ lat, lon }, s);
    if (d < nearest) nearest = d;
    if (d > maxDistKm) continue;
    if (d < 0.05) return s.hs;
    const w = 1 / (d * d);
    num += s.hs * w;
    den += w;
  }
  if (den === 0 || nearest > maxDistKm) return null;
  return num / den;
}

export function hsFill(hs: number, opacityScale = 1): { r: number; g: number; b: number; a: number } {
  if (!(hs > 0.05)) return { ...HS_RGB, a: 0 };
  const t = Math.min(1, hs / 4);
  return { ...HS_RGB, a: (0.1 + t * 0.55) * opacityScale };
}

export function collectHsSamples(
  file: MapHoursFile | null | undefined,
  spots: Array<{ id: string; lat: number; lon: number }>,
  index: number,
): HsSample[] {
  const out: HsSample[] = [];
  for (const spot of spots) {
    const hs = hsAtHour(file, spot.id, index);
    if (hs == null || hs <= 0.05) continue;
    out.push({ lat: spot.lat, lon: spot.lon, hs });
  }
  return out;
}

export function maxHs(samples: HsSample[]): number {
  let m = 0;
  for (const s of samples) if (s.hs > m) m = s.hs;
  return m;
}

export interface HsFieldTile {
  id: string;
  url: string;
  bounds: [[number, number], [number, number]];
}

export function renderHsFieldTiles(
  samples: HsSample[],
  opts: { mobile?: boolean; opacityScale?: number },
): HsFieldTile[] {
  if (typeof document === 'undefined' || !samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const maxDist = opts.mobile ? MAP_HS_MAX_DIST_KM_MOBILE : MAP_HS_MAX_DIST_KM;
  const opacityScale = opts.opacityScale ?? 1;
  const tiles: HsFieldTile[] = [];

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

    for (let y = 0; y < rows; y++) {
      const lat = box.north - ((y + 0.5) / rows) * (box.north - box.south);
      for (let x = 0; x < cols; x++) {
        const lon = box.west + ((x + 0.5) / cols) * (box.east - box.west);
        const hs = idwHs(nearby, lat, lon, maxDist);
        const fill = hsFill(hs ?? 0, opacityScale);
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
