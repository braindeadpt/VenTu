'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pointOnLand } from '@/lib/landMask';
import type { FieldSpot } from '@/lib/mapHsField';
import {
  HS_M_MAX,
  HS_M_STOPS,
  MAP_SWELL_LS_KEY,
  MAP_SWELL_PANE,
  MAP_SWELL_PANE_Z,
  SWELL_CREST_SPACING_PX,
  buildCrestLattice,
  compass16,
  crestPhase,
  fmt1,
  hsColor,
  isolineLevels,
  marchingSquares,
  pickIsolineLabel,
  rampLut,
  swellArrowLengthPx,
  swellChevrons,
  windKtColor,
  type Seg,
} from '@/lib/mapSwellField';
import { sampleSeaGrid, seaGridExtent, type SeaGrid, type SeaGridFrame, type SeaSample } from '@/lib/seaGrid';

/** Rótulos do tooltip (t.mapUiLayers). */
export interface SwellTooltipLabels {
  tipWind: string;
  tipWindValue: string;
  tipHs: string;
  tipPeriod: string;
  tipSwellFrom: string;
  tipNoSwell: string;
  tipTime: string;
}

interface UseSwellToggleOptions {
  initialEnabled: boolean;
}

/**
 * Estado do toggle «Ondulação» — separado do desenho para o pai poder pedir a
 * grelha (useSeaGrid) só quando vento ou ondulação estão ligados.
 * Deep link (`?swell=1`) liga sem gravar a pref; o toggle grava.
 */
export function useSwellToggle({ initialEnabled }: UseSwellToggleOptions) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(MAP_SWELL_LS_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (initialEnabled) setEnabled(true);
  }, [initialEnabled]);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const persist = (on: boolean) => {
    try {
      localStorage.setItem(MAP_SWELL_LS_KEY, on ? '1' : '0');
    } catch {
      /* noop */
    }
  };
  // Pref gravada fora do updater (efeitos laterais no updater correm duas
  // vezes em StrictMode).
  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    persist(next);
  }, []);
  const disableSwell = useCallback(() => {
    if (!enabledRef.current) return;
    enabledRef.current = false;
    setEnabled(false);
    persist(false);
  }, []);
  /** Estado explícito — o selector «Vento | Ondulação | Nenhum». */
  const setSwell = useCallback((on: boolean) => {
    if (enabledRef.current === on) return;
    enabledRef.current = on;
    setEnabled(on);
    persist(on);
  }, []);
  return { swellWanted: enabled, toggleSwell: toggle, disableSwell, setSwell };
}

interface UseMapSwellFieldOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  enabled: boolean;
  seaGrid: SeaGrid | null | undefined;
  seaFrame: SeaGridFrame | null;
  /** Spots com símbolo de ondulação (os visíveis/filtrados do mapa). */
  spots: FieldSpot[];
  locale: string;
  /** O tooltip mostra também o vento quando a camada de vento está ligada. */
  windOn: boolean;
  labels: SwellTooltipLabels;
}

const HS_LUT = rampLut(HS_M_STOPS, HS_M_MAX);
const CREST_FRAME_MS = 1000 / 30;
/** Cristas congelam ao fim de 20 s sem interacção (o último frame fica). */
const CREST_IDLE_PAUSE_MS = 20_000;
/** Alpha das cristas em classes — um stroke por classe em vez de um por crista. */
const CREST_ALPHA_BINS = 6;

function isZoomAnimating(map: L.Map): boolean {
  return Boolean((map as L.Map & { _animatingZoom?: boolean })._animatingZoom);
}

function emptySample(): SeaSample {
  return { u: 0, v: 0, kt: 0, windFrom: 0, hs: NaN, per: NaN, swellFrom: 0, pe: 0, pn: 0, w: 0, edge: 1 };
}

/** Subdivisão da grelha para as isolinhas — mais fina a zoom alto (linhas suaves). */
function isoRefine(zoom: number): number {
  if (zoom < 7) return 4;
  if (zoom < 9) return 8;
  return 16;
}

interface IsoCache {
  key: string;
  levels: Array<{ level: number; segs: Array<readonly [readonly [number, number], readonly [number, number]]> }>;
}

/** Região (lat/lon) onde as isolinhas são calculadas — a vista com margem. */
interface IsoView {
  south: number;
  west: number;
  north: number;
  east: number;
}

const ISO_MAX_SAMPLES = 90_000;

/**
 * Malha das isolinhas: passo = passo mais fino da grelha / `refine`, ancorada
 * a múltiplos do passo (o pan não faz as linhas «tremer») e recortada à vista
 * com margem ∩ domínio da grelha. Uma só malha para todas as caixas — com
 * caixas sobrepostas (v2) iterar por caixa duplicava linhas na zona de fusão.
 */
export function isolineLattice(
  grid: Pick<SeaGrid, 'boxes' | 'step'> & { legacy?: boolean },
  refine: number,
  view: IsoView,
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

/**
 * Isolinhas em lat/lon (cache por instante + subdivisão + região). Valores
 * de terra (máscara de terra) e de borda de costa/domínio (peso de mar < 0,5)
 * ficam NaN — as linhas não atravessam terra nem a borda exterior.
 */
function buildIsolinesLatLon(grid: SeaGrid, frame: SeaGridFrame, refine: number, view: IsoView): IsoCache['levels'] {
  const s = emptySample();
  const out: IsoCache['levels'] = [];
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
      g[j * ni + i] = hit && hit.w * hit.edge >= 0.5 && !pointOnLand(lat, lon) ? hit.hs : NaN;
    }
  }
  for (const lv of levels) {
    const segs = marchingSquares(g, ni, nj, lv);
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

interface CrestCell {
  x: number;
  y: number;
  seed: number;
  /** amostra no ponto (Hs, período, propagação) — refeita a cada instante */
  hs: number;
  per: number;
  ex: number;
  ey: number;
  w: number;
}

function fmtLisbonTime(epochMs: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : locale, {
      timeZone: 'Europe/Lisbon',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(epochMs));
  } catch {
    return '';
  }
}

/**
 * Camada «Ondulação» — portada da maquete aprovada para o Leaflet:
 *   1. campo de Hs (bilinear da grelha, raster em baixa resolução de ecrã
 *      esticado com suavização) recortado pela costa GADM;
 *   2. isolinhas a cada 0,5 m com rótulo (tamanho constante em píxeis);
 *   3. cristas de ondulação lentas, perpendiculares à direcção, numa malha
 *      de ESPAÇAMENTO CONSTANTE EM PÍXEIS de ecrã, refeita a cada zoom (sem
 *      rastos: cada frame é limpo — o problema do protótipo WebGL do #133);
 *   4. símbolo por spot: seta no sentido da ondulação com comprimento ∝ Hs e
 *      chevrons pelo período, sempre do mesmo tamanho em píxeis.
 * Reduced-motion: 1, 2 e 4 estáticos, sem cristas.
 */
export function useMapSwellField({
  mapInstanceRef,
  LRef,
  isReady,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  enabled,
  seaGrid,
  seaFrame,
  spots,
  locale,
  windOn,
  labels,
}: UseMapSwellFieldOptions) {
  const reducedMotion = usePrefersReducedMotion();
  const swellOn = isFullscreen && !isHeroEmbed && enabled && !!seaGrid && !!seaFrame;
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const crestCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  // Dados vivos por ref: o efeito principal monta canvas/listeners uma vez e
  // cada mudança de instante/spots só pede um repaint (sem piscar).
  const dataRef = useRef({ seaGrid, seaFrame, spots, windOn, labels, locale });
  const repaintRef = useRef<(() => void) | null>(null);

  // Declarado ANTES do efeito principal: no mesmo commit a ref já tem os
  // dados novos quando o canvas é (re)montado.
  useEffect(() => {
    dataRef.current = { seaGrid, seaFrame, spots, windOn, labels, locale };
    repaintRef.current?.();
  }, [seaGrid, seaFrame, spots, windOn, labels, locale]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!swellOn) {
      fieldCanvasRef.current?.remove();
      crestCanvasRef.current?.remove();
      tipRef.current?.remove();
      fieldCanvasRef.current = null;
      crestCanvasRef.current = null;
      tipRef.current = null;
      const el = map?.getContainer();
      if (el) {
        el.setAttribute('data-map-swell', 'false');
        el.removeAttribute('data-map-swell-crests');
        el.removeAttribute('data-map-swell-max');
      }
      return;
    }
    if (!isReady || !map || !LRef.current) return;
    const Leaflet = LRef.current;
    let pane = map.getPane(MAP_SWELL_PANE);
    if (!pane) pane = map.createPane(MAP_SWELL_PANE);
    pane.style.zIndex = MAP_SWELL_PANE_Z;
    pane.style.pointerEvents = 'none';
    // Escondido durante a animação de zoom — nada de esticar/arrastar o
    // frame antigo; no zoomend repinta-se à escala nova.
    pane.classList.remove('leaflet-zoom-animated');
    pane.classList.add('leaflet-zoom-hide');

    const host = map.getContainer();
    const mk = (cls: string) => {
      const c = Leaflet.DomUtil.create('canvas', cls, pane!) as HTMLCanvasElement;
      c.setAttribute('aria-hidden', 'true');
      c.style.position = 'absolute';
      return c;
    };
    const field = fieldCanvasRef.current ?? mk('ventu-swell-field');
    const crests = crestCanvasRef.current ?? mk('ventu-swell-crests');
    fieldCanvasRef.current = field;
    crestCanvasRef.current = crests;
    if (field.parentElement !== pane) pane.appendChild(field);
    if (crests.parentElement !== pane) pane.appendChild(crests);
    const raster = document.createElement('canvas');
    const fontFamily = getComputedStyle(host).fontFamily || 'system-ui, sans-serif';
    const RS = isMobile ? 4 : 3;

    let isoCache: IsoCache | null = null;
    let lattice: CrestCell[] = [];
    const sample = emptySample();

    const project = (lat: number, lon: number, origin: L.Point) => {
      const p = map.latLngToLayerPoint([lat, lon]);
      return { x: p.x - origin.x, y: p.y - origin.y };
    };

    const sizeCanvas = (c: HTMLCanvasElement, dpr: number) => {
      const size = map.getSize();
      const w = Math.round(size.x * dpr);
      const h = Math.round(size.y * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        c.style.width = `${size.x}px`;
        c.style.height = `${size.y}px`;
      }
      return size;
    };

    const paintRaster = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const { seaGrid: grid, seaFrame: frame } = dataRef.current;
      if (!grid || !frame) return;
      const rw = Math.ceil(W / RS);
      const rh = Math.ceil(H / RS);
      if (raster.width !== rw || raster.height !== rh) {
        raster.width = rw;
        raster.height = rh;
      }
      const rctx = raster.getContext('2d');
      if (!rctx) return;
      const img = rctx.createImageData(rw, rh);
      const d = img.data;
      // Mercator: lon só depende de x e lat só de y.
      const lons = new Float64Array(rw);
      const lats = new Float64Array(rh);
      for (let x = 0; x < rw; x++) lons[x] = map.containerPointToLatLng([(x + 0.5) * RS, 0]).lng;
      for (let y = 0; y < rh; y++) lats[y] = map.containerPointToLatLng([0, (y + 0.5) * RS]).lat;
      let p = 0;
      for (let y = 0; y < rh; y++) {
        const lat = lats[y];
        for (let x = 0; x < rw; x++, p += 4) {
          const lon = lons[x];
          const hit = sampleSeaGrid(grid, frame, lat, lon, sample);
          if (!hit || Number.isNaN(hit.hs) || pointOnLand(lat, lon)) {
            d[p + 3] = 0;
            continue;
          }
          const a = Math.min(1, Math.max(0, (hit.w - 0.2) / 0.4)) * hit.edge;
          const k = Math.max(0, Math.min(255, Math.round((hit.hs / HS_M_MAX) * 255))) * 3;
          d[p] = HS_LUT[k];
          d[p + 1] = HS_LUT[k + 1];
          d[p + 2] = HS_LUT[k + 2];
          d[p + 3] = a * 215;
        }
      }
      rctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(raster, 0, 0, rw * RS, rh * RS);
    };

    const paintIsolines = (ctx: CanvasRenderingContext2D, origin: L.Point, W: number, H: number) => {
      const { seaGrid: grid, seaFrame: frame, locale: loc } = dataRef.current;
      if (!grid || !frame) return;
      const refine = isoRefine(map.getZoom());
      // Vista com 40 % de margem, arredondada a 0,5° — o pan dentro da margem
      // reaproveita a cache; fora dela recalcula só a região nova.
      const vb = map.getBounds();
      const padLat = (vb.getNorth() - vb.getSouth()) * 0.4;
      const padLon = (vb.getEast() - vb.getWest()) * 0.4;
      const q = (x: number, up: boolean) => (up ? Math.ceil(x * 2) : Math.floor(x * 2)) / 2;
      const view = {
        south: q(vb.getSouth() - padLat, false),
        west: q(vb.getWest() - padLon, false),
        north: q(vb.getNorth() + padLat, true),
        east: q(vb.getEast() + padLon, true),
      };
      const key = `${frame.tf.toFixed(4)}|${refine}|${grid.generatedAt}|${view.south},${view.west},${view.north},${view.east}`;
      if (!isoCache || isoCache.key !== key) {
        isoCache = { key, levels: buildIsolinesLatLon(grid, frame, refine, view) };
      }
      ctx.lineCap = 'round';
      const margin = { x0: 40, y0: 72, x1: W - 40, y1: H - 120 };
      const target = { x: W * 0.32, y: H * 0.42 };
      const labelsOut: ReturnType<typeof pickIsolineLabel>[] = [];
      for (const L0 of isoCache.levels) {
        const whole = Math.abs(L0.level - Math.round(L0.level)) < 0.01;
        ctx.strokeStyle = whole ? 'rgba(235,248,255,0.62)' : 'rgba(235,248,255,0.32)';
        ctx.lineWidth = whole ? 1.3 : 0.9;
        ctx.beginPath();
        const px: Seg[] = [];
        for (const [a, b] of L0.segs) {
          const pa = project(a[0], a[1], origin);
          const pb = project(b[0], b[1], origin);
          if ((pa.x < -20 && pb.x < -20) || (pa.y < -20 && pb.y < -20) || (pa.x > W + 20 && pb.x > W + 20) || (pa.y > H + 20 && pb.y > H + 20)) continue;
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
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
        const text = `${fmt1(lab.level, loc)} m`;
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
    };

    const spotSwell = (s: FieldSpot) => {
      const { seaGrid: grid, seaFrame: frame } = dataRef.current;
      if (!grid || !frame) return null;
      // O spot vive na praia: se a célula ainda é «terra», procura o mar a oeste/sul.
      const tries: Array<[number, number]> = [[0, 0], [0, -0.12], [-0.08, -0.08], [-0.12, 0], [0, -0.25]];
      for (const [dlat, dlon] of tries) {
        const hit = sampleSeaGrid(grid, frame, s.lat + dlat, s.lon + dlon, sample);
        if (hit && !Number.isNaN(hit.hs) && hit.w >= 0.35) return { hs: hit.hs, per: hit.per, ex: hit.pe, ey: -hit.pn };
      }
      return null;
    };

    const paintSymbols = (ctx: CanvasRenderingContext2D, origin: L.Point, W: number, H: number) => {
      const drawn: Array<{ x: number; y: number }> = [];
      for (const s of dataRef.current.spots) {
        const { x, y } = project(s.lat, s.lon, origin);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        // Sem sobreposição — o primeiro spot da lista ganha o lugar.
        if (drawn.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < 34 * 34)) continue;
        const v = spotSwell(s);
        if (!v) continue;
        drawn.push({ x, y });
        const { ex, ey } = v;
        const Lp = swellArrowLengthPx(v.hs);
        const hx = x - ex * 8;
        const hy = y - ey * 8;
        const tx = hx - ex * Lp;
        const ty = hy - ey * Lp;
        const col = hsColor(v.hs);
        const pxp = -ey;
        const pyp = ex;
        const nc = swellChevrons(v.per);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? col : 'rgba(4,12,22,0.85)';
          ctx.lineWidth = pass ? 2.2 : 4.6;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(hx - ex * 4, hy - ey * 4);
          ctx.stroke();
          ctx.beginPath();
          for (let c = 0; c < nc; c++) {
            const f = 0.12 + c * 0.17;
            const cx = tx + ex * Lp * f;
            const cy = ty + ey * Lp * f;
            ctx.moveTo(cx - ex * 4 + pxp * 4.5, cy - ey * 4 + pyp * 4.5);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx - ex * 4 - pxp * 4.5, cy - ey * 4 - pyp * 4.5);
          }
          ctx.stroke();
          ctx.fillStyle = pass ? col : 'rgba(4,12,22,0.85)';
          const hw = pass ? 4.5 : 6;
          const hl = pass ? 9 : 11.5;
          ctx.beginPath();
          ctx.moveTo(hx + ex * (pass ? 0 : 1.5), hy + ey * (pass ? 0 : 1.5));
          ctx.lineTo(hx - ex * hl + pxp * hw, hy - ey * hl + pyp * hw);
          ctx.lineTo(hx - ex * hl - pxp * hw, hy - ey * hl - pyp * hw);
          ctx.closePath();
          ctx.fill();
        }
      }
    };

    /** Amostra a grelha nos pontos da malha (a cada instante novo ou view nova). */
    const resampleLattice = () => {
      const { seaGrid: grid, seaFrame: frame } = dataRef.current;
      if (!grid || !frame) return;
      for (const c of lattice) {
        const ll = map.containerPointToLatLng([c.x, c.y]);
        const hit = pointOnLand(ll.lat, ll.lng) ? null : sampleSeaGrid(grid, frame, ll.lat, ll.lng, sample);
        if (!hit || Number.isNaN(hit.hs) || hit.w < 0.5) {
          c.w = 0;
          continue;
        }
        c.hs = hit.hs;
        c.per = hit.per;
        c.ex = hit.pe;
        c.ey = -hit.pn;
        c.w = hit.w * hit.edge;
      }
    };

    const rebuildLattice = (W: number, H: number) => {
      // Ancorada aos píxeis-mundo do zoom actual: um pan mantém cada crista
      // sobre o mesmo ponto do mar; o zoom refaz a malha (mesmo espaçamento).
      const pb = map.getPixelBounds();
      const S = SWELL_CREST_SPACING_PX;
      const ox = (((-pb.min!.x) % S) + S) % S;
      const oy = (((-pb.min!.y) % S) + S) % S;
      lattice = buildCrestLattice(W, H, ox, oy, S).map((p) => ({
        x: p.x, y: p.y, seed: p.seed, hs: NaN, per: NaN, ex: 0, ey: 0, w: 0,
      }));
      resampleLattice();
      host.setAttribute('data-map-swell-crests', String(lattice.length));
    };

    let canvasOrigin: L.Point = map.containerPointToLayerPoint([0, 0]);

    const renderStatic = () => {
      const fctx = field.getContext('2d');
      if (!fctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = sizeCanvas(field, dpr);
      sizeCanvas(crests, 1);
      const W = size.x;
      const H = size.y;
      canvasOrigin = map.containerPointToLayerPoint([0, 0]);
      Leaflet.DomUtil.setPosition(field, canvasOrigin);
      Leaflet.DomUtil.setPosition(crests, canvasOrigin);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, W, H);
      fctx.globalAlpha = 0.86;
      paintRaster(fctx, W, H);
      fctx.globalAlpha = 1;
      paintIsolines(fctx, canvasOrigin, W, H);
      paintSymbols(fctx, canvasOrigin, W, H);
      const frame = dataRef.current.seaFrame;
      if (frame) host.setAttribute('data-map-swell-max', frame.hsMax.toFixed(1));
      if (!reducedMotion) rebuildLattice(W, H);
      else {
        const cctx = crests.getContext('2d');
        cctx?.clearRect(0, 0, crests.width, crests.height);
        lattice = [];
        host.setAttribute('data-map-swell-crests', '0');
      }
    };

    // Cristas — loop a 30 fps, sem rasto (clear a cada frame).
    let lastDraw = 0;
    const idle = { lastActive: performance.now(), paused: false };
    const alphaBins: Array<Array<number>> = Array.from({ length: CREST_ALPHA_BINS }, () => []);
    const tick = (t: number) => {
      rafRef.current = 0;
      if (idle.paused || reducedMotion) return;
      if (document.hidden || isZoomAnimating(map)) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (t - lastDraw < CREST_FRAME_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastDraw = t;
      const ctx = crests.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, crests.width, crests.height);
      for (const b of alphaBins) b.length = 0;
      const S = SWELL_CREST_SPACING_PX;
      for (const c of lattice) {
        if (c.w <= 0) continue;
        const ph = crestPhase(t, c.per, c.seed, S);
        const f = ph / S;
        const a = Math.sin(Math.PI * f) * Math.min(1, 0.25 + c.hs / 2.2) * Math.min(1, (c.w - 0.4) / 0.4);
        if (a < 0.04) continue;
        const off = ph - S / 2;
        const x = c.x + c.ex * off;
        const y = c.y + c.ey * off;
        const L0 = 5 + Math.min(4, c.hs) * 5.5;
        const qx = -c.ey * L0;
        const qy = c.ex * L0;
        const bin = Math.min(CREST_ALPHA_BINS - 1, Math.floor(a * CREST_ALPHA_BINS));
        alphaBins[bin].push(
          x - qx - c.ex * L0 * 0.3, y - qy - c.ey * L0 * 0.3,
          x + c.ex * L0 * 0.25, y + c.ey * L0 * 0.25,
          x + qx - c.ex * L0 * 0.3, y + qy - c.ey * L0 * 0.3,
        );
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.2;
      for (let b = 0; b < CREST_ALPHA_BINS; b++) {
        const arr = alphaBins[b];
        if (!arr.length) continue;
        ctx.strokeStyle = `rgba(242,251,255,${(((b + 0.5) / CREST_ALPHA_BINS) * 0.6).toFixed(3)})`;
        ctx.beginPath();
        for (let q = 0; q < arr.length; q += 6) {
          ctx.moveTo(arr[q], arr[q + 1]);
          ctx.quadraticCurveTo(arr[q + 2], arr[q + 3], arr[q + 4], arr[q + 5]);
        }
        ctx.stroke();
      }
      if (t - idle.lastActive > CREST_IDLE_PAUSE_MS) {
        idle.paused = true;
        host.setAttribute('data-map-swell-paused', 'true');
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    const wake = () => {
      idle.lastActive = performance.now();
      if (idle.paused && !reducedMotion) {
        idle.paused = false;
        host.setAttribute('data-map-swell-paused', 'false');
      }
      if (!rafRef.current && !reducedMotion) rafRef.current = requestAnimationFrame(tick);
    };

    // Repaint coalescido (um por frame) — tick das 48 h, view nova, refresh.
    let repaintRaf = 0;
    const scheduleRepaint = () => {
      if (repaintRaf) return;
      repaintRaf = requestAnimationFrame(() => {
        repaintRaf = 0;
        renderStatic();
        wake();
      });
    };
    repaintRef.current = scheduleRepaint;

    const onZoomStart = () => {
      // Limpa já: o frame antigo nunca é esticado nem arrastado para a escala nova.
      const cctx = crests.getContext('2d');
      cctx?.clearRect(0, 0, crests.width, crests.height);
      lattice = [];
    };
    const onViewEnd = () => scheduleRepaint();

    // ── Tooltip (ponteiro fino) ──
    const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
    let tip: HTMLDivElement | null = null;
    if (finePointer) {
      tip = tipRef.current ?? document.createElement('div');
      tip.className = 'ventu-swell-tip';
      tip.setAttribute('aria-hidden', 'true');
      tip.hidden = true;
      if (tip.parentElement !== host) host.appendChild(tip);
      tipRef.current = tip;
    }
    let tipRaf = 0;
    let lastMove: L.LeafletMouseEvent | null = null;
    const hideTip = () => {
      if (tip) tip.hidden = true;
    };
    const renderTip = () => {
      tipRaf = 0;
      const e = lastMove;
      const { seaGrid: grid, seaFrame: frame, labels: lab, windOn: wOn, locale: loc } = dataRef.current;
      if (!tip || !e || !grid || !frame) return hideTip();
      const target = e.originalEvent?.target as Element | null;
      // Por cima de um marcador / popup manda o tooltip do spot.
      if (target && target.closest?.('.leaflet-marker-pane, .leaflet-popup-pane, .leaflet-tooltip-pane, .leaflet-control')) {
        return hideTip();
      }
      const { lat, lng } = e.latlng;
      const hit = sampleSeaGrid(grid, frame, lat, lng, emptySample());
      if (!hit) return hideTip();
      const land = pointOnLand(lat, lng);
      const swell = !land && !Number.isNaN(hit.hs) && hit.w >= 0.4;
      const head = `${fmt1(Math.abs(lat), loc)}° ${lat >= 0 ? 'N' : 'S'} · ${fmt1(Math.abs(lng), loc)}° ${
        lng >= 0 ? 'E' : loc === 'pt' || loc === 'es' || loc === 'fr' ? 'O' : 'W'
      }`;
      const rows: string[] = [];
      const sw = (c: string) => `<i class="ventu-swell-tip__sw" style="background:${c}"></i>`;
      if (wOn && Number.isFinite(hit.kt)) {
        const wv = lab.tipWindValue
          .replace('{kt}', String(Math.round(hit.kt)))
          .replace('{dir}', compass16(hit.windFrom, loc))
          .replace('{deg}', String(Math.round(hit.windFrom)));
        rows.push(`<div class="ventu-swell-tip__r"><span>${sw(windKtColor(hit.kt))}${lab.tipWind}</span><span>${wv}</span></div>`);
      }
      if (swell) {
        rows.push(`<div class="ventu-swell-tip__r"><span>${sw(hsColor(hit.hs))}${lab.tipHs}</span><span>${fmt1(hit.hs, loc)} m</span></div>`);
        rows.push(`<div class="ventu-swell-tip__r"><span>${lab.tipPeriod}</span><span>${fmt1(hit.per, loc)} s</span></div>`);
        rows.push(`<div class="ventu-swell-tip__r"><span>${lab.tipSwellFrom}</span><span>${compass16(hit.swellFrom, loc)} (${Math.round(hit.swellFrom)}°)</span></div>`);
      } else {
        rows.push(`<div class="ventu-swell-tip__r"><span>${dataRef.current.labels.tipHs}</span><span>${lab.tipNoSwell}</span></div>`);
      }
      const epoch = (grid.t0 + frame.tf * grid.stepHours * 3600) * 1000;
      rows.push(`<div class="ventu-swell-tip__r"><span>${lab.tipTime}</span><span>${fmtLisbonTime(epoch, loc)}</span></div>`);
      tip.innerHTML = `<p class="ventu-swell-tip__h">${head}</p>${rows.join('')}`;
      tip.hidden = false;
      const size = map.getSize();
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const { x, y } = e.containerPoint;
      const left = x + 16 + tw > size.x - 8 ? x - 16 - tw : x + 16;
      const top = Math.min(size.y - th - 8, Math.max(8, y + 14));
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      lastMove = e;
      wake();
      if (!tipRaf) tipRaf = requestAnimationFrame(renderTip);
    };

    map.on('zoomstart', onZoomStart);
    map.on('zoomend', onViewEnd);
    map.on('moveend', onViewEnd);
    map.on('resize', onViewEnd);
    map.on('movestart', wake);
    if (finePointer) {
      map.on('mousemove', onMouseMove);
      map.on('mouseout', hideTip);
      map.on('movestart', hideTip);
    }
    host.addEventListener('pointerdown', wake, { passive: true });
    host.addEventListener('touchstart', wake, { passive: true });

    host.setAttribute('data-map-swell', 'true');
    host.setAttribute('data-map-swell-paused', 'false');
    renderStatic();
    if (!reducedMotion) rafRef.current = requestAnimationFrame(tick);

    return () => {
      repaintRef.current = null;
      if (repaintRaf) cancelAnimationFrame(repaintRaf);
      if (tipRaf) cancelAnimationFrame(tipRaf);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      map.off('zoomstart', onZoomStart);
      map.off('zoomend', onViewEnd);
      map.off('moveend', onViewEnd);
      map.off('resize', onViewEnd);
      map.off('movestart', wake);
      if (finePointer) {
        map.off('mousemove', onMouseMove);
        map.off('mouseout', hideTip);
        map.off('movestart', hideTip);
      }
      host.removeEventListener('pointerdown', wake);
      host.removeEventListener('touchstart', wake);
      hideTip();
      host.removeAttribute('data-map-swell-paused');
    };
  }, [swellOn, isReady, isMobile, reducedMotion, mapInstanceRef, LRef]);

  return {
    swellOn,
    /** Grelha em falta (404/velha) ou sem a hora pedida — o item mostra «indisponível». */
    swellUnavailable: seaGrid === null || (!!seaGrid && !seaFrame),
    swellRange: swellOn && seaFrame ? { min: seaFrame.hsMin, max: seaFrame.hsMax } : null,
  };
}
