import { hsAtHour, type MapHoursFile } from '@/lib/mapHours';
import { MAP_HS_LS_KEY } from '@/lib/map-constants';

export { MAP_HS_LS_KEY };
export const MAP_HS_PANE = 'hs';
/** Below Leaflet overlay pane (400) so radar sits on top; under markers (600). */
export const MAP_HS_PANE_Z = '350';

/** Ribbon around the coast — far enough to merge spots, short enough to leave land empty. */
export const MAP_HS_MAX_DIST_KM = 38;
export const MAP_HS_MAX_DIST_KM_MOBILE = 28;
/** ~6 km on the mainland. */
export const MAP_HS_STEP_DEG = 0.055;
export const MAP_HS_STEP_DEG_MOBILE = 0.1;
/** Extra canvas pixels per IDW cell so Leaflet stretch stays smooth. */
export const MAP_HS_PIXEL_SCALE = 4;
export const MAP_HS_OPACITY = 0.9;
export const MAP_HS_OPACITY_MOBILE = 0.66;
/** Typical west-coast Hs saturates the fill; 4 m made summer look like a flat wash. */
export const MAP_HS_FILL_MAX_M = 2.4;
/** Crest isolines — dashed so they read as swell, not IH bathymetry. */
export const MAP_HS_ISOLINES_M = [0.75, 1.2, 2.0] as const;
/** Tight ring around island spots — 38 km would paint the whole island. */
export const MAP_HS_MAX_DIST_KM_ISLAND = 16;
export const MAP_HS_MAX_DIST_KM_ISLAND_MOBILE = 12;
/** Iberian interior — cells closer to this than the nearest coast sample are inland. */
export const MAINLAND_INLAND = { lat: 39.82, lon: -7.28 } as const;

/** `--data-waves` sky-700 — deep / mar de espelho. */
const HS_DEEP = { r: 3, g: 105, b: 161 } as const;
/** `--data-waves` sky-500 — working swell. */
const HS_WAVE = { r: 14, g: 165, b: 233 } as const;
/** `--fg` — foam at 2.4 m+. */
const HS_FOAM = { r: 241, g: 245, b: 249 } as const;

export interface FieldSpot {
  id: string;
  lat: number;
  lon: number;
  type?: string;
  bestSwell?: string;
}

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

/**
 * Tiles cover the coast plus ~80 km of ocean so the falloff finishes inside
 * the overlay — never a hard west edge through the swell field.
 */
export const MAP_HS_BOUNDS: readonly HsBounds[] = [
  { id: 'mainland', south: 36.82, west: -10.55, north: 42.22, east: -7.12 },
  { id: 'azores', south: 36.85, west: -31.55, north: 39.85, east: -24.75 },
  { id: 'madeira', south: 32.28, west: -17.55, north: 33.22, east: -16.15 },
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

/** Lakes / cables stay off the ocean field. */
export function isOceanFieldSpot(spot: Pick<FieldSpot, 'type' | 'bestSwell'>): boolean {
  if (spot.type === 'wakeboard') return false;
  const swell = (spot.bestSwell ?? '').toLowerCase();
  return !swell.includes('lagoa') && !swell.includes('albufeira');
}

/**
 * Full strength near the coast, quadratic fade to 0 at maxDist — kills the
 * rectangular slab without a coastline polygon.
 */
export function coastFalloff(nearestKm: number, maxDistKm: number): number {
  if (!(nearestKm < maxDistKm) || maxDistKm <= 0) return 0;
  const inner = maxDistKm * 0.34;
  if (nearestKm <= inner) return 1;
  const t = (nearestKm - inner) / (maxDistKm - inner);
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

export function fieldMaxDistKm(tileId: string, mobile = false): number {
  if (tileId === 'azores' || tileId === 'madeira') {
    return mobile ? MAP_HS_MAX_DIST_KM_ISLAND_MOBILE : MAP_HS_MAX_DIST_KM_ISLAND;
  }
  return mobile ? MAP_HS_MAX_DIST_KM_MOBILE : MAP_HS_MAX_DIST_KM;
}

/**
 * Ocean side of the coast keeps the ribbon; land side dies within ~9 km
 * so the Alentejo / Beira interior stays empty.
 */
export function landAwareFalloff(
  lat: number,
  lon: number,
  nearest: { lat: number; lon: number },
  nearestKm: number,
  maxDistKm: number,
  tileId: string,
): number {
  const ocean = coastFalloff(nearestKm, maxDistKm);
  if (ocean <= 0) return 0;
  if (tileId !== 'mainland') return ocean;
  const dCell = distKm({ lat, lon }, MAINLAND_INLAND);
  const dCoast = distKm(nearest, MAINLAND_INLAND);
  if (dCell >= dCoast - 1.2) return ocean;
  return ocean * coastFalloff(nearestKm, 9);
}

export function idwHsAt(
  samples: HsSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): { hs: number; nearestKm: number; nearest: { lat: number; lon: number } } | null {
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
    if (d < 0.05) return { hs: s.hs, nearestKm: d, nearest: { lat: s.lat, lon: s.lon } };
    const w = 1 / (d * d);
    num += s.hs * w;
    den += w;
  }
  if (den === 0 || nearest > maxDistKm) return null;
  return { hs: num / den, nearestKm: nearest, nearest: { lat: nearestPt.lat, lon: nearestPt.lon } };
}

/** Inverse-distance weighting. `null` when every sample is beyond `maxDistKm`. */
export function idwHs(
  samples: HsSample[],
  lat: number,
  lon: number,
  maxDistKm: number,
): number | null {
  return idwHsAt(samples, lat, lon, maxDistKm)?.hs ?? null;
}

function lerpChan(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Piecewise around Portuguese summer Hs (median ~0.7 m, p90 ~0.9 m).
 * Linear `hs / 2.4` parked the whole west coast in one cyan wash.
 */
export function hsNorm(hs: number): number {
  if (!(hs > 0.05)) return 0;
  if (hs >= MAP_HS_FILL_MAX_M) return 1;
  if (hs <= 0.45) return (hs / 0.45) * 0.12;
  if (hs <= 0.75) return 0.12 + ((hs - 0.45) / 0.3) * 0.38;
  if (hs <= 1.1) return 0.5 + ((hs - 0.75) / 0.35) * 0.22;
  if (hs <= 1.8) return 0.72 + ((hs - 1.1) / 0.7) * 0.16;
  return 0.88 + ((hs - 1.8) / 0.6) * 0.12;
}

export function hsFill(
  hs: number,
  opacityScale = 1,
): { r: number; g: number; b: number; a: number } {
  if (!(hs > 0.05)) return { ...HS_DEEP, a: 0 };
  const t = hsNorm(hs);
  if (t <= 0.55) {
    const u = t / 0.55;
    return {
      r: lerpChan(HS_DEEP.r, HS_WAVE.r, u),
      g: lerpChan(HS_DEEP.g, HS_WAVE.g, u),
      b: lerpChan(HS_DEEP.b, HS_WAVE.b, u),
      a: (0.22 + u * 0.44) * opacityScale,
    };
  }
  const u = (t - 0.55) / 0.45;
  const s = u * u * (3 - 2 * u);
  const foam = 0.62 * s;
  return {
    r: lerpChan(HS_WAVE.r, HS_FOAM.r, foam),
    g: lerpChan(HS_WAVE.g, HS_FOAM.g, foam),
    b: lerpChan(HS_WAVE.b, HS_FOAM.b, foam),
    a: (0.66 + s * 0.24) * opacityScale,
  };
}

export function collectHsSamples(
  file: MapHoursFile | null | undefined,
  spots: FieldSpot[],
  index: number,
): HsSample[] {
  const out: HsSample[] = [];
  for (const spot of spots) {
    if (!isOceanFieldSpot(spot)) continue;
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

export function softenFieldCanvas(canvas: HTMLCanvasElement, radiusPx: number): void {
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

function isoLerp(a: number, b: number, th: number): number {
  const d = b - a;
  if (Math.abs(d) < 1e-6) return 0.5;
  return (th - a) / d;
}

function drawHsIsolines(
  ctx: CanvasRenderingContext2D,
  hs: Float32Array,
  fall: Float32Array,
  cols: number,
  rows: number,
  scale: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([3.4, 2.6]);
  for (let ti = 0; ti < MAP_HS_ISOLINES_M.length; ti++) {
    const th = MAP_HS_ISOLINES_M[ti];
    ctx.strokeStyle = ti === 0 ? 'rgb(241 245 249 / 0.32)' : 'rgb(241 245 249 / 0.52)';
    ctx.lineWidth = ti === 0 ? 1.05 : 1.35;
    ctx.beginPath();
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const i00 = y * cols + x;
        const i10 = i00 + 1;
        const i01 = i00 + cols;
        const i11 = i01 + 1;
        const fmin = Math.min(fall[i00], fall[i10], fall[i01], fall[i11]);
        if (!(fmin > 0.4)) continue;
        const v00 = hs[i00];
        const v10 = hs[i10];
        const v01 = hs[i01];
        const v11 = hs[i11];
        if (v00 < 0 || v10 < 0 || v01 < 0 || v11 < 0) continue;
        const pts: Array<{ x: number; y: number }> = [];
        const edge = (
          va: number,
          vb: number,
          xa: number,
          ya: number,
          xb: number,
          yb: number,
        ) => {
          if ((va - th) * (vb - th) >= 0) return;
          const t = isoLerp(va, vb, th);
          pts.push({ x: xa + t * (xb - xa), y: ya + t * (yb - ya) });
        };
        edge(v00, v10, x, y, x + 1, y);
        edge(v10, v11, x + 1, y, x + 1, y + 1);
        edge(v01, v11, x, y + 1, x + 1, y + 1);
        edge(v00, v01, x, y, x, y + 1);
        if (pts.length < 2) continue;
        ctx.moveTo((pts[0].x + 0.5) * scale, (pts[0].y + 0.5) * scale);
        ctx.lineTo((pts[1].x + 0.5) * scale, (pts[1].y + 0.5) * scale);
        if (pts.length >= 4) {
          ctx.moveTo((pts[2].x + 0.5) * scale, (pts[2].y + 0.5) * scale);
          ctx.lineTo((pts[3].x + 0.5) * scale, (pts[3].y + 0.5) * scale);
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function renderHsFieldTiles(
  samples: HsSample[],
  opts: { mobile?: boolean; opacityScale?: number },
): HsFieldTile[] {
  if (typeof document === 'undefined' || !samples.length) return [];
  const step = opts.mobile ? MAP_HS_STEP_DEG_MOBILE : MAP_HS_STEP_DEG;
  const opacityScale = opts.opacityScale ?? 1;
  const tiles: HsFieldTile[] = [];

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
    const hsGrid = new Float32Array(cols * rows);
    const fallGrid = new Float32Array(cols * rows);
    hsGrid.fill(-1);

    for (let y = 0; y < rows; y++) {
      const lat = box.north - ((y + 0.5) / rows) * (box.north - box.south);
      for (let x = 0; x < cols; x++) {
        const lon = box.west + ((x + 0.5) / cols) * (box.east - box.west);
        const at = idwHsAt(nearby, lat, lon, maxDist);
        if (!at) continue;
        const falloff = landAwareFalloff(lat, lon, at.nearest, at.nearestKm, maxDist, box.id);
        if (falloff <= 0.02) continue;
        const i = y * cols + x;
        hsGrid[i] = at.hs;
        fallGrid[i] = falloff;
        stampCell(img, w, x, y, scale, hsFill(Math.round(at.hs * 10) / 10, opacityScale * falloff));
      }
    }
    ctx.putImageData(img, 0, 0);
    // Light blur — heavy smear collapsed 0.8 m and 1.5 m into the same cyan.
    softenFieldCanvas(canvas, Math.max(0.7, scale * 0.26));
    drawHsIsolines(ctx, hsGrid, fallGrid, cols, rows, scale);
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
