/**
 * Campo de vento + ondulação para o lab «Mar vivo».
 *
 * Enquanto não existe uma grelha de modelo publicada, o campo é interpolado no
 * cliente (IDW, potência 2) a partir dos spots de `map-hours.json`. A grelha é
 * regular em coordenadas Web Mercator (não em lat/lon), para que a amostragem
 * na GPU coincida com o mapa sem reprojectar.
 *
 * Saída por instante (fraccionário — interpolação linear entre passos de 3 h):
 *   texWind  RGBA8: R=u, G=v (±30 m/s, de onde sopra → para onde vai), B=Hs/8 m, A=confiança
 *   texSwell RGBA8: R,G = direcção de propagação (vector unitário E,N), B=Tp/25 s, A=confiança
 */
import type { SeedSpot, SwellSnapshot } from './types';

export interface GridSpec {
  west: number;
  east: number;
  south: number;
  north: number;
  nx: number;
  ny: number;
}

/** Continente + ~150 km de mar a oeste, Golfo de Cádis a sul. */
export const GRID: GridSpec = { west: -11.6, east: -5.6, south: 35.6, north: 43.2, nx: 72, ny: 96 };

export const WIND_RANGE_MS = 30;
export const HS_RANGE_M = 8;
export const TP_RANGE_S = 25;

export function lonToMercX(lon: number): number {
  return (lon + 180) / 360;
}
export function latToMercY(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - (0.25 * Math.log((1 + s) / (1 - s))) / Math.PI;
}
export function mercYToLat(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** [x0, y0, x1, y1] em Mercator 0..1 (y0 = norte). */
export function gridMercBounds(g: GridSpec = GRID): [number, number, number, number] {
  return [lonToMercX(g.west), latToMercY(g.north), lonToMercX(g.east), latToMercY(g.south)];
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Pesos IDW normalizados, célula × semente (matriz densa — ~7k × ~150). */
interface Weights {
  w: Float32Array;
  nSeeds: number;
  /** Confiança 0..1 por célula (decai com a distância à semente mais próxima). */
  mask: Float32Array;
}

function buildWeights(
  seeds: { lat: number; lon: number }[],
  cellLat: Float64Array,
  cellLon: Float64Array,
  fullKm: number,
  zeroKm: number,
): Weights {
  const cells = cellLat.length;
  const n = seeds.length;
  const w = new Float32Array(cells * n);
  const mask = new Float32Array(cells);
  for (let c = 0; c < cells; c++) {
    let sum = 0;
    let dmin = Infinity;
    const base = c * n;
    for (let s = 0; s < n; s++) {
      const d = distKm(cellLat[c], cellLon[c], seeds[s].lat, seeds[s].lon);
      if (d < dmin) dmin = d;
      // ε = 6 km evita a singularidade em cima do spot e alisa o campo.
      const wi = 1 / (d * d + 36);
      w[base + s] = wi;
      sum += wi;
    }
    if (sum > 0) for (let s = 0; s < n; s++) w[base + s] /= sum;
    mask[c] = n ? smoothstep(zeroKm, fullKm, dmin) : 0;
  }
  return { w, nSeeds: n, mask };
}

/** Série temporal de um spot de `map-hours.json`. */
export interface SpotSeries {
  windSpd: number[]; // m/s
  windDir: number[]; // ° de onde sopra
  hs: number[]; // m
}

export interface SeaField {
  steps: number;
  cells: number;
  nx: number;
  ny: number;
  bounds: [number, number, number, number];
  /** Por passo: u, v (m/s, E/N), Hs (m). */
  u: Float32Array[];
  v: Float32Array[];
  hs: Float32Array[];
  /** Por passo: direcção de propagação (E/N, não normalizada) e Tp (s). */
  sx: Float32Array[];
  sy: Float32Array[];
  tp: Float32Array[];
  windMask: Float32Array;
  swellMask: Float32Array;
  hasSwell: boolean;
  windSeedCount: number;
  /** Buffers RGBA8 reutilizados a cada `sample`. */
  texWind: Uint8Array;
  texSwell: Uint8Array;
}

function nearestSnapshotIndex(snapshotTimes: string[], key: string): number {
  const exact = snapshotTimes.indexOf(key);
  if (exact >= 0) return exact;
  const toH = (k: string) => Date.parse(`${k}:00:00Z`) / 3600000;
  const target = toH(key);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < snapshotTimes.length; i++) {
    const d = Math.abs(toH(snapshotTimes[i]) - target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  // Mais de 6 h de distância: não inventamos — o passo fica sem ondulação.
  return bestD <= 6 ? best : -1;
}

export function buildSeaField(opts: {
  times: string[];
  seeds: SeedSpot[];
  series: Record<string, SpotSeries>;
  swell: SwellSnapshot | null;
  grid?: GridSpec;
}): SeaField {
  const g = opts.grid ?? GRID;
  const bounds = gridMercBounds(g);
  const { nx, ny } = g;
  const cells = nx * ny;
  const cellLat = new Float64Array(cells);
  const cellLon = new Float64Array(cells);
  for (let j = 0; j < ny; j++) {
    const my = bounds[1] + ((j + 0.5) / ny) * (bounds[3] - bounds[1]);
    const lat = mercYToLat(my);
    for (let i = 0; i < nx; i++) {
      const mx = bounds[0] + ((i + 0.5) / nx) * (bounds[2] - bounds[0]);
      cellLat[j * nx + i] = lat;
      cellLon[j * nx + i] = mx * 360 - 180;
    }
  }

  const steps = opts.times.length;
  const windSeeds = opts.seeds.filter((s) => opts.series[s.id]);
  // Ondulação: só spots de mar aberto com Hs real e direcção/período no snapshot.
  const swellSeeds = opts.seeds.filter((s) => {
    const ser = opts.series[s.id];
    if (!s.sea || !ser || !opts.swell) return false;
    if (!opts.swell.dir[s.id] || !opts.swell.per[s.id]) return false;
    return Math.max(...ser.hs) >= 0.3;
  });

  const ww = buildWeights(windSeeds, cellLat, cellLon, 35, 150);
  const sw = buildWeights(swellSeeds, cellLat, cellLon, 25, 110);

  const u: Float32Array[] = [];
  const v: Float32Array[] = [];
  const hs: Float32Array[] = [];
  const sx: Float32Array[] = [];
  const sy: Float32Array[] = [];
  const tp: Float32Array[] = [];

  const snapIdx = opts.times.map((t) =>
    opts.swell ? nearestSnapshotIndex(opts.swell.times, t.slice(0, 13)) : -1,
  );
  let swellSteps = 0;

  for (let k = 0; k < steps; k++) {
    // Valores das sementes neste passo.
    const su = new Float32Array(ww.nSeeds);
    const sv = new Float32Array(ww.nSeeds);
    windSeeds.forEach((s, idx) => {
      const ser = opts.series[s.id];
      const spd = ser.windSpd[k] ?? 0;
      const dir = ((ser.windDir[k] ?? 0) * Math.PI) / 180;
      // Meteorológico (de onde vem) → vector para onde vai.
      su[idx] = -spd * Math.sin(dir);
      sv[idx] = -spd * Math.cos(dir);
    });
    const shs = new Float32Array(sw.nSeeds);
    const sdx = new Float32Array(sw.nSeeds);
    const sdy = new Float32Array(sw.nSeeds);
    const stp = new Float32Array(sw.nSeeds);
    const si = snapIdx[k];
    if (si >= 0) swellSteps++;
    swellSeeds.forEach((s, idx) => {
      shs[idx] = opts.series[s.id].hs[k] ?? 0;
      if (si < 0 || !opts.swell) return;
      const dir = ((opts.swell.dir[s.id][si] ?? 0) * Math.PI) / 180;
      sdx[idx] = -Math.sin(dir);
      sdy[idx] = -Math.cos(dir);
      stp[idx] = opts.swell.per[s.id][si] ?? 0;
    });

    const cu = new Float32Array(cells);
    const cv = new Float32Array(cells);
    const ch = new Float32Array(cells);
    const cx = new Float32Array(cells);
    const cy = new Float32Array(cells);
    const ct = new Float32Array(cells);
    for (let c = 0; c < cells; c++) {
      let a = 0;
      let b = 0;
      const wb = c * ww.nSeeds;
      for (let s = 0; s < ww.nSeeds; s++) {
        const w = ww.w[wb + s];
        a += w * su[s];
        b += w * sv[s];
      }
      cu[c] = a;
      cv[c] = b;
      let h = 0;
      let dx = 0;
      let dy = 0;
      let t = 0;
      const sb = c * sw.nSeeds;
      for (let s = 0; s < sw.nSeeds; s++) {
        const w = sw.w[sb + s];
        h += w * shs[s];
        dx += w * sdx[s];
        dy += w * sdy[s];
        t += w * stp[s];
      }
      ch[c] = h;
      cx[c] = dx;
      cy[c] = dy;
      ct[c] = t;
    }
    u.push(cu);
    v.push(cv);
    hs.push(ch);
    sx.push(cx);
    sy.push(cy);
    tp.push(ct);
  }

  return {
    steps,
    cells,
    nx,
    ny,
    bounds,
    u,
    v,
    hs,
    sx,
    sy,
    tp,
    windMask: ww.mask,
    swellMask: sw.mask,
    hasSwell: swellSeeds.length > 0 && swellSteps > 0,
    windSeedCount: windSeeds.length,
    texWind: new Uint8Array(cells * 4),
    texSwell: new Uint8Array(cells * 4),
  };
}

const enc = (x: number) => (x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255));

/**
 * Preenche `texWind`/`texSwell` para o instante fraccionário `t` (0..steps-1),
 * com interpolação linear entre os dois passos vizinhos.
 */
export function sampleSeaField(f: SeaField, t: number): void {
  const tt = Math.min(Math.max(t, 0), f.steps - 1);
  const i0 = Math.floor(tt);
  const i1 = Math.min(i0 + 1, f.steps - 1);
  const a = tt - i0;
  const b = 1 - a;
  const { u, v, hs, sx, sy, tp } = f;
  const W = f.texWind;
  const S = f.texSwell;
  for (let c = 0; c < f.cells; c++) {
    const o = c * 4;
    const cu = u[i0][c] * b + u[i1][c] * a;
    const cv = v[i0][c] * b + v[i1][c] * a;
    const ch = hs[i0][c] * b + hs[i1][c] * a;
    W[o] = enc(cu / (2 * WIND_RANGE_MS) + 0.5);
    W[o + 1] = enc(cv / (2 * WIND_RANGE_MS) + 0.5);
    W[o + 2] = enc(ch / HS_RANGE_M);
    W[o + 3] = enc(f.windMask[c]);
    let dx = sx[i0][c] * b + sx[i1][c] * a;
    let dy = sy[i0][c] * b + sy[i1][c] * a;
    const len = Math.hypot(dx, dy);
    const ok = len > 0.15; // direcções a anularem-se → sem cristas
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    const ct = tp[i0][c] * b + tp[i1][c] * a;
    S[o] = enc(dx * 0.5 + 0.5);
    S[o + 1] = enc(dy * 0.5 + 0.5);
    S[o + 2] = enc(ct / TP_RANGE_S);
    S[o + 3] = ok && ct > 3 ? enc(f.swellMask[c]) : 0;
  }
}

/** Valor do campo de vento numa célula — usado para as setas estáticas. */
export function windAtCell(f: SeaField, c: number): { u: number; v: number; mask: number } {
  const o = c * 4;
  return {
    u: (f.texWind[o] / 255 - 0.5) * 2 * WIND_RANGE_MS,
    v: (f.texWind[o + 1] / 255 - 0.5) * 2 * WIND_RANGE_MS,
    mask: f.texWind[o + 3] / 255,
  };
}
