'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pointOnLand } from '@/lib/landMask';
import {
  buildScreenLandMask,
  cutLand,
  landClipViewSync,
  LAND_CLIP_WAIT_MS,
  prepareLandClip,
  screenMaskAt,
  type LandClipView,
  type ScreenLandMask,
} from '@/lib/landClip';
import type { FieldSpot } from '@/lib/mapHsField';
import {
  MAP_SWELL_LS_KEY,
  MAP_SWELL_PANE,
  MAP_SWELL_PANE_Z,
  SWELL_CREST_SPACING_PX,
  buildCrestLattice,
  compass16,
  crestPhase,
  fmt1,
  hsColor,
  swellArrowLengthPx,
  swellChevrons,
  windKtColor,
} from '@/lib/mapSwellField';
import {
  buildIsolinesLatLon,
  drawIsolines,
  emptySample,
  isoRefine,
  paintSwellRaster,
  type IsoLevels,
  type ScreenView,
} from '@/lib/seaFieldPaint';
import { sampleSeaGrid, type SeaGrid, type SeaGridFrame } from '@/lib/seaGrid';
import { mapScreenView, mapClipBounds } from './mapScreenView';

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

const CREST_FRAME_MS = 1000 / 30;
/** Cristas congelam ao fim de 20 s sem interacção (o último frame fica). */
const CREST_IDLE_PAUSE_MS = 20_000;
/** Alpha das cristas em classes — um stroke por classe em vez de um por crista. */
const CREST_ALPHA_BINS = 6;

function isZoomAnimating(map: L.Map): boolean {
  return Boolean((map as L.Map & { _animatingZoom?: boolean })._animatingZoom);
}

interface IsoCache {
  key: string;
  levels: IsoLevels;
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

    // Recorte vectorial da terra + máscara de ecrã da vista actual (refeitos
    // a cada repaint; os mosaicos e o Path2D ficam em cache em landClip.ts).
    let clip: LandClipView | null = null;
    let landMask: ScreenLandMask | null = null;
    let clipPending = false;
    let clipMissing = false;
    // Recorte atrasado (> LAND_CLIP_WAIT_MS): desenha já com a máscara raster
    // e repinta com o corte vectorial quando os mosaicos chegarem.
    let clipSlow = false;
    const isLandPx = (x: number, y: number) => (landMask ? screenMaskAt(landMask, x, y) : false);

    /** Recorte pronto para a vista? Senão pede-o e repinta quando chegar. */
    const ensureClip = (view: ScreenView): boolean => {
      const bounds = mapClipBounds(map, 0.1);
      clip = landClipViewSync(bounds, view.zoom);
      if (clip) {
        landMask = buildScreenLandMask(clip, view.zoom, view.origin, view.W, view.H, 2);
        return true;
      }
      landMask = null;
      if (clipMissing) return true; // sem índice: desenha sem recorte (raster abaixo)
      if (!clipPending) {
        clipPending = true;
        const slowTimer = window.setTimeout(() => {
          if (!clipPending || clipSlow) return;
          clipSlow = true;
          repaintRef.current?.();
        }, LAND_CLIP_WAIT_MS);
        prepareLandClip(bounds, view.zoom).then((lv) => {
          window.clearTimeout(slowTimer);
          clipPending = false;
          if (!lv) clipMissing = true;
          repaintRef.current?.();
        });
      }
      return clipSlow;
    };

    const paintIsolines = (ctx: CanvasRenderingContext2D, view: ScreenView) => {
      const { seaGrid: grid, seaFrame: frame, locale: loc } = dataRef.current;
      if (!grid || !frame) return;
      const refine = isoRefine(view.zoom);
      // Vista com 40 % de margem, arredondada a 0,5° — o pan dentro da margem
      // reaproveita a cache; fora dela recalcula só a região nova.
      const vb = map.getBounds();
      const padLat = (vb.getNorth() - vb.getSouth()) * 0.4;
      const padLon = (vb.getEast() - vb.getWest()) * 0.4;
      const q = (x: number, up: boolean) => (up ? Math.ceil(x * 2) : Math.floor(x * 2)) / 2;
      const region = {
        south: q(vb.getSouth() - padLat, false),
        west: q(vb.getWest() - padLon, false),
        north: q(vb.getNorth() + padLat, true),
        east: q(vb.getEast() + padLon, true),
      };
      const key = `${frame.tf.toFixed(4)}|${refine}|${grid.generatedAt}|${region.south},${region.west},${region.north},${region.east}`;
      if (!isoCache || isoCache.key !== key) {
        isoCache = { key, levels: buildIsolinesLatLon(grid, frame, refine, region) };
      }
      drawIsolines(ctx, isoCache.levels, view, loc, fontFamily, landMask ? isLandPx : undefined);
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
        const land = landMask ? isLandPx(c.x, c.y) : pointOnLand(ll.lat, ll.lng);
        const hit = land ? null : sampleSeaGrid(grid, frame, ll.lat, ll.lng, sample);
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
      const view = mapScreenView(map);
      // Sem o recorte da vista ainda carregado não se pinta nada (nunca terra
      // pintada «à espera») durante LAND_CLIP_WAIT_MS; depois pinta com a
      // máscara raster e o pedido repinta quando os mosaicos chegarem.
      const ready = ensureClip(view);
      host.setAttribute('data-map-swell-clip', clip ? 'vector' : ready ? 'raster' : 'loading');
      const { seaGrid: grid, seaFrame: fr } = dataRef.current;
      if (ready && grid && fr) {
        fctx.globalAlpha = 0.86;
        // Sem índice do recorte (404): cai na máscara raster antiga.
        paintSwellRaster(fctx, raster, grid, fr, view, RS, clip ? undefined : pointOnLand);
        fctx.globalAlpha = 1;
        paintIsolines(fctx, view);
        // Corte vectorial da terra (rias, lagoas e estuários contam como
        // terra) — anti-aliased, nítido a qualquer zoom.
        if (clip) cutLand(fctx, clip, view.zoom, view.origin, dpr);
        paintSymbols(fctx, canvasOrigin, W, H);
      }
      const frame = dataRef.current.seaFrame;
      if (frame) host.setAttribute('data-map-swell-max', frame.hsMax.toFixed(1));
      if (!reducedMotion && ready) rebuildLattice(W, H);
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
        // Nenhuma crista entra em terra (máscara do recorte vectorial).
        if (landMask) {
          const ax = x - qx - c.ex * L0 * 0.3;
          const ay = y - qy - c.ey * L0 * 0.3;
          const bx = x + qx - c.ex * L0 * 0.3;
          const by = y + qy - c.ey * L0 * 0.3;
          if (isLandPx(ax, ay) || isLandPx(bx, by) || isLandPx(x + c.ex * L0 * 0.25, y + c.ey * L0 * 0.25)) continue;
        }
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
      const land = landMask ? isLandPx(e.containerPoint.x, e.containerPoint.y) : pointOnLand(lat, lng);
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
