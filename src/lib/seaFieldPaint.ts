/**
 * Pintura dos campos «Ondulação» (raster de Hs + isolinhas) e utilitários de
 * projecção partilhados com o «Vento» — funções puras sobre um contexto
 * Canvas2D, usadas pelos hooks (`useMapSwellField`, `useMapWindField`) e
 * pelo render offline de verificação visual (scripts/render-sea-field.mjs),
 * para o que se vê no PNG ser exactamente o que o browser desenha.
 *
 * Ordem de desenho (hook): raster → isolinhas + rótulos → corte vectorial da
 * terra (`cutLand`, landClip.ts) → símbolos dos spots (vivem na praia).
 */
import { lonLatToWorld } from '@/lib/landClip';
import { HS_M_MAX, HS_M_STOPS, fmt1, isolineLevels, marchingSquares, pickIsolineLabel, rampLut, type Seg } from '@/lib/mapSwellField';
import { sampleSeaGrid, seaGridExtent, type SeaGrid, type SeaGridFrame, type SeaSample } from '@/lib/seaGrid';

/** Vista em Web Mercator: zoom (fraccionário) + píxel-mundo do canto superior esquerdo. */
export interface ScreenView {
  W: number;
  H: number;
  zoom: number;
  origin: { x: number; y: number };
}

export function screenLon(v: ScreenView, x: number): number {
  return ((v.origin.x + x) / (256 * 2 ** v.zoom)) * 360 - 180;
}

export function screenLat(v: ScreenView, y: number): number {
  const n = Math.PI - (2 * Math.PI * (v.origin.y + y)) / (256 * 2 ** v.zoom);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function toScreen(v: ScreenView, lat: number, lon: number): { x: number; y: number } {
  const w = lonLatToWorld(lon, lat, v.zoom);
  return { x: w.x - v.origin.x, y: w.y - v.origin.y };
}

export function viewBounds(v: ScreenView, padFrac = 0): { south: number; west: number; north: number; east: number } {
  const px = v.W * padFrac;
  const py = v.H * padFrac;
  return {
    south: screenLat(v, v.H + py),
    north: screenLat(v, -py),
    west: screenLon(v, -px),
    east: screenLon(v, v.W + px),
  };
}

export function emptySample(): SeaSample {
  return { u: 0, v: 0, kt: 0, windFrom: 0, hs: NaN, per: NaN, swellFrom: 0, pe: 0, pn: 0, w: 0, edge: 1 };
}

const HS_LUT = rampLut(HS_M_STOPS, HS_M_MAX);

/**
 * Opacidade do raster de Hs num ponto: esbate a borda do domínio (`edge`) e
 * onde o modelo não tem mar (`w`). Em v3 a grelha vem preenchida até à
 * costa, por isso `w` = 1 junto a terra (sem faixa escura) e só desce onde o
 * WW3 não tem dados (Mediterrâneo, Báltico).
 */
export function swellAlpha(hit: SeaSample): number {
  return Math.min(1, Math.max(0, (hit.w - 0.2) / 0.4)) * hit.edge;
}

interface RasterTarget {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/**
 * Raster de Hs: amostra a grelha a cada `RS` píxeis (Mercator: lon só depende
 * de x, lat só de y), escreve num canvas pequeno e estica-o com suavização.
 * Não corta terra — o corte vectorial vem depois (`cutLand`).
 */
export function paintSwellRaster(
  ctx: CanvasRenderingContext2D,
  raster: RasterTarget,
  grid: SeaGrid,
  frame: SeaGridFrame,
  view: ScreenView,
  RS: number,
  /** Fallback sem recorte vectorial: máscara raster por amostra. */
  landAt?: (lat: number, lon: number) => boolean,
): void {
  const rw = Math.ceil(view.W / RS);
  const rh = Math.ceil(view.H / RS);
  if (raster.width !== rw || raster.height !== rh) {
    raster.width = rw;
    raster.height = rh;
  }
  const rctx = raster.getContext('2d');
  if (!rctx) return;
  const img = rctx.createImageData(rw, rh);
  const d = img.data;
  const lons = new Float64Array(rw);
  const lats = new Float64Array(rh);
  for (let x = 0; x < rw; x++) lons[x] = screenLon(view, (x + 0.5) * RS);
  for (let y = 0; y < rh; y++) lats[y] = screenLat(view, (y + 0.5) * RS);
  const sample = emptySample();
  let p = 0;
  for (let y = 0; y < rh; y++) {
    const lat = lats[y];
    for (let x = 0; x < rw; x++, p += 4) {
      const hit = sampleSeaGrid(grid, frame, lat, lons[x], sample);
      if (!hit || Number.isNaN(hit.hs) || landAt?.(lat, lons[x])) {
        d[p + 3] = 0;
        continue;
      }
      const a = swellAlpha(hit);
      const k = Math.max(0, Math.min(255, Math.round((hit.hs / HS_M_MAX) * 255))) * 3;
      d[p] = HS_LUT[k];
      d[p + 1] = HS_LUT[k + 1];
      d[p + 2] = HS_LUT[k + 2];
      d[p + 3] = a * 215;
    }
  }
  rctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(raster as unknown as CanvasImageSource, 0, 0, rw * RS, rh * RS);
}

/** Subdivisão da grelha para as isolinhas — mais fina a zoom alto (linhas suaves). */
export function isoRefine(zoom: number): number {
  if (zoom < 7) return 4;
  if (zoom < 9) return 8;
  return 16;
}

const ISO_MAX_SAMPLES = 90_000;
const ISO_HALF_QUANTUM_M = 0.05;

/**
 * Malha das isolinhas: passo = passo mais fino da grelha / `refine`, ancorada
 * a múltiplos do passo (o pan não faz as linhas «tremer») e recortada à vista
 * com margem ∩ domínio da grelha.
 */
export function isolineLattice(
  grid: Pick<SeaGrid, 'boxes' | 'step'> & { legacy?: boolean },
  refine: number,
  view: { south: number; west: number; north: number; east: number },
): { south: number; west: number; d: number; ni: number; nj: number } | null {
  const ext = seaGridExtent(grid);
  let d = grid.step / refine;
  const west0 = Math.max(ext.west, view.west);
  const east0 = Math.min(ext.east, view.east);
  const south0 = Math.max(ext.south, view.south);
  const north0 = Math.min(ext.north, view.north);
  if (!(east0 > west0 && north0 > south0)) return null;
  while (((east0 - west0) / d) * ((north0 - south0) / d) > ISO_MAX_SAMPLES) d *= 2;
  const west = Math.floor(west0 / d) * d;
  const south = Math.floor(south0 / d) * d;
  const ni = Math.ceil((east0 - west) / d) + 1;
  const nj = Math.ceil((north0 - south) / d) + 1;
  return { south, west, d, ni, nj };
}

export type IsoLevels = Array<{ level: number; segs: Array<readonly [readonly [number, number], readonly [number, number]]> }>;

/**
 * Isolinhas em lat/lon. Com a grelha preenchida (v3) as linhas seguem até à
 * costa e entram em terra — o corte vectorial apara-as à linha de costa.
 * Só a borda exterior do domínio (e, em v1/v2, a borda da costa) fica NaN.
 */
export function buildIsolinesLatLon(
  grid: SeaGrid,
  frame: SeaGridFrame,
  refine: number,
  view: { south: number; west: number; north: number; east: number },
): IsoLevels {
  const s = emptySample();
  const out: IsoLevels = [];
  const levels = isolineLevels(frame.hsMin, frame.hsMax);
  if (!levels.length) return out;
  const lat0 = isolineLattice(grid, refine, view);
  if (!lat0) return out;
  const { south, west, d, ni, nj } = lat0;
  const g = new Float32Array(ni * nj);
  for (let j = 0; j < nj; j++) {
    const lat = south + j * d;
    for (let i = 0; i < ni; i++) {
      const lon = west + i * d;
      const hit = sampleSeaGrid(grid, frame, lat, lon, s);
      g[j * ni + i] = hit && hit.w * hit.edge >= 0.5 ? hit.hs : NaN;
    }
  }
  // Hs chega quantizado (0,1 m) numa malha de 0,5–2°: o bilinear de
  // planaltos dá isolinhas em escada. Duas passagens de média móvel
  // separável (meia célula da grelha, ignorando NaN) arredondam-nas.
  const r = Math.max(1, Math.round(grid.step / d / 2));
  smoothNaN(g, ni, nj, r);
  smoothNaN(g, ni, nj, r);
  for (const lv of levels) {
    // Hs vem quantizado a 0,1 m: um nível exactamente num degrau (2,0 m)
    // segue as bordas dos planaltos em escada. Meio degrau abaixo, a linha
    // passa entre 1,9 e 2,0 — suave, e a leitura «≥ 2,0 m» mantém-se.
    const segs = marchingSquares(g, ni, nj, lv - ISO_HALF_QUANTUM_M);
    out.push({
      level: lv,
      segs: segs.map(([p, q]) => [
        [south + p[1] * d, west + p[0] * d],
        [south + q[1] * d, west + q[0] * d],
      ] as const),
    });
  }
  return out;
}

/** Média móvel separável (raio `r`) que ignora NaN e mantém NaN onde estava. */
export function smoothNaN(g: Float32Array, ni: number, nj: number, r: number): void {
  const tmp = new Float32Array(g.length);
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const k = j * ni + i;
      if (Number.isNaN(g[k])) {
        tmp[k] = NaN;
        continue;
      }
      let s = 0;
      let c = 0;
      for (let d = -r; d <= r; d++) {
        const ii = i + d;
        if (ii < 0 || ii >= ni) continue;
        const x = g[j * ni + ii];
        if (Number.isNaN(x)) continue;
        s += x;
        c++;
      }
      tmp[k] = s / c;
    }
  }
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const k = j * ni + i;
      if (Number.isNaN(tmp[k])) {
        g[k] = NaN;
        continue;
      }
      let s = 0;
      let c = 0;
      for (let d = -r; d <= r; d++) {
        const jj = j + d;
        if (jj < 0 || jj >= nj) continue;
        const x = tmp[jj * ni + i];
        if (Number.isNaN(x)) continue;
        s += x;
        c++;
      }
      g[k] = s / c;
    }
  }
}

/**
 * Desenha isolinhas + um rótulo por nível. Os rótulos nunca caem em terra
 * (`isLand` em píxeis de ecrã) — o corte vectorial apara as linhas a seguir.
 */
export function drawIsolines(
  ctx: CanvasRenderingContext2D,
  levels: IsoLevels,
  view: ScreenView,
  locale: string,
  fontFamily: string,
  isLand?: (x: number, y: number) => boolean,
): void {
  const { W, H } = view;
  ctx.lineCap = 'round';
  const margin = { x0: 40, y0: 72, x1: W - 40, y1: H - 120 };
  const target = { x: W * 0.32, y: H * 0.42 };
  const labelsOut: ReturnType<typeof pickIsolineLabel>[] = [];
  for (const L0 of levels) {
    const whole = Math.abs(L0.level - Math.round(L0.level)) < 0.01;
    ctx.strokeStyle = whole ? 'rgba(235,248,255,0.62)' : 'rgba(235,248,255,0.32)';
    ctx.lineWidth = whole ? 1.3 : 0.9;
    ctx.beginPath();
    const px: Seg[] = [];
    for (const [a, b] of L0.segs) {
      const pa = toScreen(view, a[0], a[1]);
      const pb = toScreen(view, b[0], b[1]);
      if ((pa.x < -20 && pb.x < -20) || (pa.y < -20 && pb.y < -20) || (pa.x > W + 20 && pb.x > W + 20) || (pa.y > H + 20 && pb.y > H + 20)) continue;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      // Candidatos a rótulo: só segmentos de mar com folga (~12 px) para a costa.
      if (isLand) {
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        if (isLand(mx, my) || isLand(mx - 14, my) || isLand(mx + 14, my) || isLand(mx, my - 9) || isLand(mx, my + 9)) continue;
      }
      px.push([[pa.x, pa.y], [pb.x, pb.y]]);
    }
    ctx.stroke();
    labelsOut.push(pickIsolineLabel(px, L0.level, margin, target));
  }
  ctx.font = `600 10px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const lab of labelsOut) {
    if (!lab) continue;
    const text = `${fmt1(lab.level, locale)} m`;
    ctx.save();
    ctx.translate(lab.x, lab.y);
    ctx.rotate(lab.angle);
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(6,18,31,0.78)';
    ctx.fillRect(-w / 2, -7, w, 14);
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }
}
