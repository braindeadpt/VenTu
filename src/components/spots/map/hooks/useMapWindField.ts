'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import {
  MAP_WIND_FADE,
  MAP_WIND_PANE,
  MAP_WIND_PANE_Z,
  MAP_WIND_PARTICLES,
  MAP_WIND_PARTICLES_MOBILE,
  advectWindParticle,
  buildWindFieldGrids,
  collectWindSamples,
  drawWindParticles,
  spawnWindParticle,
  type WindParticle,
} from '@/lib/mapWindField';
import type { FieldSpot } from '@/lib/mapHsField';

interface UseMapWindFieldOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  enabled: boolean;
  hoursFile: MapHoursFile | null;
  hoursLive: boolean;
  hoursFrame: number;
  spots: FieldSpot[];
}

function isZoomAnimating(map: L.Map): boolean {
  return Boolean((map as L.Map & { _animatingZoom?: boolean })._animatingZoom);
}

function cssRgbToken(el: Element, name: string, fallback: string): string {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  return raw || fallback;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Campo de vento costeiro — partículas advectadas numa grelha IDW dos spots,
 * num canvas num pane Leaflet por baixo dos marcadores. Segue o padrão de
 * useMapCurrentsField (pane, zoom-hide, DPR cap, cleanup de rAF); a diferença
 * é o loop contínuo: fade do frame + advecção + segmento por partícula.
 *
 * Reduced-motion / fallback leve: corre ~140 passos de uma vez e pára —
 * o mesmo campo congelado (streamlines), zero custo contínuo.
 */
export function useMapWindField({
  mapInstanceRef,
  LRef,
  isReady,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  enabled,
  hoursFile,
  hoursLive,
  hoursFrame,
  spots,
}: UseMapWindFieldOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const particlesRef = useRef<WindParticle[]>([]);
  const zoomRafRef = useRef(0);
  const [reducedMotion] = useState(prefersReducedMotion);
  // O campo precisa do ficheiro mesmo sem o layer «48h» — fetchMapHours tem
  // cache+inflight dedup, por isso o segundo pedido é gratuito.
  const [selfFile, setSelfFile] = useState<MapHoursFile | null>(null);

  const wantsField = isFullscreen && !isHeroEmbed && enabled;
  useEffect(() => {
    if (!wantsField || hoursFile || selfFile) return;
    let cancelled = false;
    fetchMapHours().then((data) => {
      if (!cancelled) setSelfFile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [wantsField, hoursFile, selfFile]);

  const file = hoursFile ?? selfFile;
  const windOn = wantsField && !!file?.wind;
  const frame = hoursLive ? hoursFrame : 0;
  const samples = useMemo(
    () => (windOn && file ? collectWindSamples(file, spots, frame) : []),
    [windOn, file, spots, frame],
  );
  const grids = useMemo(
    () => (windOn ? buildWindFieldGrids(samples, { mobile: isMobile }) : []),
    [windOn, samples, isMobile],
  );

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!windOn || !grids.length) {
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
      particlesRef.current = [];
      const el = map?.getContainer();
      if (el) el.setAttribute('data-map-windfield', 'false');
      return;
    }
    if (!isReady || !map || !LRef.current) return;

    const Leaflet = LRef.current;
    let pane = map.getPane(MAP_WIND_PANE);
    if (!pane) pane = map.createPane(MAP_WIND_PANE);
    pane.style.zIndex = MAP_WIND_PANE_Z;
    pane.style.pointerEvents = 'none';
    pane.classList.remove('leaflet-zoom-animated');
    pane.classList.add('leaflet-zoom-hide');

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = Leaflet.DomUtil.create('canvas', 'ventu-windfield-canvas', pane) as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvasRef.current = canvas;
    } else if (canvas.parentElement !== pane) {
      pane.appendChild(canvas);
    }

    const host = map.getContainer();
    const color = cssRgbToken(host, '--data-wind', '167 139 250');
    const budget = isMobile ? MAP_WIND_PARTICLES_MOBILE : MAP_WIND_PARTICLES;
    const particles = particlesRef.current;

    const sizeCanvas = () => {
      const size = map.getSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(size.x * dpr);
      const h = Math.round(size.y * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      return { size, dpr };
    };

    const spawnView = () => {
      const b = map.getBounds();
      return {
        south: b.getSouth() - 0.15,
        west: b.getWest() - 0.15,
        north: b.getNorth() + 0.15,
        east: b.getEast() + 0.15,
      };
    };

    const respawnAll = () => {
      particles.length = 0;
      const view = spawnView();
      for (let i = 0; i < budget; i++) {
        const p: WindParticle = { lat: 0, lon: 0, px: 0, py: 0, hasPrev: false, life: 0, kt: 0, jit: 1 };
        if (spawnWindParticle(grids, view, p)) particles.push(p);
      }
    };

    const paintStatic = () => {
      // Reduced-motion: corre a simulação sem fade e pára — streamlines.
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { size, dpr } = sizeCanvas();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      respawnAll();
      const origin = map.containerPointToLayerPoint([0, 0]);
      const project = (lat: number, lon: number) => {
        const p = map.latLngToLayerPoint([lat, lon]);
        return { x: p.x - origin.x, y: p.y - origin.y };
      };
      const steps = 110;
      const zoom = map.getZoom();
      ctx.lineCap = 'round';
      for (const p of particles) {
        let drawn = false;
        for (let s = 0; s < steps; s++) {
          if (!advectWindParticle(grids, p, 0.016, zoom)) break;
          const pt = project(p.lat, p.lon);
          if (drawn) {
            const k = s / steps;
            const a = Math.min(0.7, 0.22 + p.kt / 50) * (1 - k * k);
            ctx.strokeStyle = `rgb(${color} / ${a.toFixed(3)})`;
            ctx.lineWidth = (p.kt > 19 ? 1.7 : 1.15) * (1 - k * 0.5);
            ctx.beginPath();
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
          }
          p.px = pt.x;
          p.py = pt.y;
          drawn = true;
        }
      }
    };

    const tick = (t: number) => {
      rafRef.current = 0;
      if (document.hidden || isZoomAnimating(map)) {
        // Continua a agendar — retoma quando visível/anim acabar.
        rafRef.current = requestAnimationFrame(tick);
        lastTRef.current = t;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (t - lastTRef.current) / 1000 || 0.016));
      lastTRef.current = t;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { size, dpr } = sizeCanvas();
      if (size.x < 2 || size.y < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const origin = map.containerPointToLayerPoint([0, 0]);
      Leaflet.DomUtil.setPosition(canvas, origin);
      // fade dos trails
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${MAP_WIND_FADE})`;
      ctx.fillRect(0, 0, size.x, size.y);
      ctx.globalCompositeOperation = 'source-over';

      const view = spawnView();
      const zoom = map.getZoom();
      for (const p of particles) {
        if (!advectWindParticle(grids, p, dt, zoom)) {
          if (!spawnWindParticle(grids, view, p)) {
            // fora do campo nesta vista — volta a tentar com vida curta
            p.life = 30;
          }
        }
      }
      drawWindParticles(
        ctx,
        particles,
        (lat, lon) => {
          const p = map.latLngToLayerPoint([lat, lon]);
          return { x: p.x - origin.x, y: p.y - origin.y };
        },
        color,
        isMobile ? 0.8 : 1,
        { width: size.x, height: size.y },
      );
      rafRef.current = requestAnimationFrame(tick);
    };

    const onZoomStart = () => {
      canvas.style.visibility = 'hidden';
    };
    const onZoomEnd = () => {
      zoomRafRef.current = requestAnimationFrame(() => {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = 0;
          canvas.style.visibility = '';
          // novo nível de zoom — trails velhos ficam na escala errada
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const size = map.getSize();
            ctx.clearRect(0, 0, size.x, size.y);
          }
          respawnAll();
          if (reducedMotion) paintStatic();
        });
      });
    };
    const onMove = () => {
      // O fade (destination-in) demora ~1,5 s a matar trails velhos — durante
      // o pan ficavam «sombras» da posição anterior. Limpar de imediato:
      // as partículas continuam geo-ancoradas e o campo reconstrói em ms.
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      for (const p of particles) p.hasPrev = false;
    };
    const onMoveEnd = () => {
      if (reducedMotion) paintStatic();
    };

    respawnAll();
    map.on('zoomstart', onZoomStart);
    map.on('zoomend', onZoomEnd);
    map.on('move', onMove);
    map.on('moveend', onMoveEnd);
    if (reducedMotion) paintStatic();
    else {
      lastTRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }

    const el = map.getContainer();
    el.setAttribute('data-map-windfield', 'true');

    return () => {
      map.off('zoomstart', onZoomStart);
      map.off('zoomend', onZoomEnd);
      map.off('move', onMove);
      map.off('moveend', onMoveEnd);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = 0;
      }
      const el2 = map.getContainer();
      if (el2) el2.setAttribute('data-map-windfield', 'false');
    };
  }, [windOn, isReady, grids, isMobile, reducedMotion, mapInstanceRef, LRef]);

  return { windFieldOn: windOn, windFieldUnavailable: file !== null && !file?.wind };
}
