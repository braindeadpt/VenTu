'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { MAP_CURRENTS_LS_KEY } from '@/lib/map-constants';
import {
  MAP_CURRENT_FLOW_FADE,
  MAP_CURRENT_FLOW_PARTICLES,
  MAP_CURRENT_FLOW_PARTICLES_MOBILE,
  MAP_CURRENT_OPACITY,
  MAP_CURRENT_OPACITY_MOBILE,
  MAP_CURRENT_PANE,
  MAP_CURRENT_PANE_Z,
  MAP_CURRENT_PX_PER_S_PER_MS,
  buildCurrentFieldGrids,
  collectCurrentParticles,
  collectCurrentSamples,
  currentFlowStrength,
  currentParticleStepDeg,
  drawCurrentFlowParticles,
  drawCurrentTicks,
  maxCurrentSpd,
  type CurrentFlowParticle,
} from '@/lib/mapCurrentsField';
import {
  advectWindParticle,
  spawnWindParticle,
  type FlowCell,
} from '@/lib/mapWindField';
import type { FieldSpot } from '@/lib/mapHsField';

interface UseMapCurrentsFieldOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  initialEnabled: boolean;
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

export function useMapCurrentsField({
  mapInstanceRef,
  LRef,
  isReady,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  initialEnabled,
  hoursFile,
  hoursLive,
  hoursFrame,
  spots,
}: UseMapCurrentsFieldOptions) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    try {
      const v = localStorage.getItem(MAP_CURRENTS_LS_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      /* noop */
    }
    return false;
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  // Handles of the nested onZoomEnd repaint pair — cancelled on cleanup so
  // the frames never outlive the map (React #418-free unmount, CI 34075896616).
  const zoomRafRef = useRef(0);
  const flowParticlesRef = useRef<CurrentFlowParticle[]>([]);
  const lastTRef = useRef(0);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [fetchedFile, setFetchedFile] = useState<MapHoursFile | null | undefined>(undefined);

  useEffect(() => {
    if (initialEnabled) setEnabled(true);
  }, [initialEnabled]);

  useEffect(() => {
    if (!enabled || !isFullscreen || isHeroEmbed) return;
    if (fetchedFile !== undefined) return;
    if (hoursFile?.currents) return;
    let cancelled = false;
    fetchMapHours().then((data) => {
      if (!cancelled) setFetchedFile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isFullscreen, isHeroEmbed, hoursFile, fetchedFile]);

  const file = hoursFile ?? fetchedFile ?? null;
  const currentsOn = isFullscreen && !isHeroEmbed && enabled && !!file?.currents;
  const frame = hoursLive ? hoursFrame : 0;
  const samples = useMemo(
    () => (currentsOn && file ? collectCurrentSamples(file, spots, frame) : []),
    [currentsOn, file, spots, frame],
  );
  const sampleMax = maxCurrentSpd(samples);
  const grids = useMemo(
    () => (currentsOn ? buildCurrentFieldGrids(samples, { mobile: isMobile }) : []),
    [currentsOn, samples, isMobile],
  );
  const opacity = isMobile ? MAP_CURRENT_OPACITY_MOBILE : MAP_CURRENT_OPACITY;

  const toggleCurrents = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_CURRENTS_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!currentsOn) {
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
      const el = map?.getContainer();
      if (el) {
        el.setAttribute('data-map-currents', 'false');
        el.removeAttribute('data-map-currents-frame');
        el.removeAttribute('data-map-currents-max');
      }
      return;
    }
    if (!isReady || !map || !LRef.current) return;

    const Leaflet = LRef.current;
    let pane = map.getPane(MAP_CURRENT_PANE);
    if (!pane) pane = map.createPane(MAP_CURRENT_PANE);
    pane.style.zIndex = MAP_CURRENT_PANE_Z;
    pane.style.pointerEvents = 'none';
    pane.classList.remove('leaflet-zoom-animated');
    pane.classList.add('leaflet-zoom-hide');

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = Leaflet.DomUtil.create('canvas', 'ventu-current-canvas', pane) as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvasRef.current = canvas;
    } else if (canvas.parentElement !== pane) {
      pane.appendChild(canvas);
    }

    const host = map.getContainer();
    const colors = {
      water: cssRgbToken(host, '--data-water', '34 211 238'),
      halo: cssRgbToken(host, '--bg-base', '2 6 23'),
    };

    const paint = () => {
      const layer = canvasRef.current;
      // Defence in depth: a scheduled frame can fire between cancelAnimationFrame
      // and the unmount — the map (and its canvas) may already be destroyed.
      if (!layer || !mapInstanceRef.current) return;
      if (isZoomAnimating(map)) {
        layer.style.visibility = 'hidden';
        return;
      }
      layer.style.visibility = '';
      const size = map.getSize();
      if (size.x < 2 || size.y < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(size.x * dpr);
      const h = Math.round(size.y * dpr);
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
        layer.style.width = `${size.x}px`;
        layer.style.height = `${size.y}px`;
      }
      Leaflet.DomUtil.setPosition(layer, map.containerPointToLayerPoint([0, 0]));
      const origin = map.containerPointToLayerPoint([0, 0]);
      const ctx = layer.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const b = map.getBounds();
      const step = currentParticleStepDeg(map.getZoom(), isMobile);
      const pad = step * 2;
      const particles = collectCurrentParticles(
        grids,
        {
          south: b.getSouth() - pad,
          west: b.getWest() - pad,
          north: b.getNorth() + pad,
          east: b.getEast() + pad,
        },
        step,
      );
      drawCurrentTicks(
        ctx,
        particles,
        (lat, lon) => {
          const p = map.latLngToLayerPoint([lat, lon]);
          return { x: p.x - origin.x, y: p.y - origin.y };
        },
        colors,
        opacity,
        { width: size.x, height: size.y },
      );
    };

    const onZoomStart = () => {
      if (canvasRef.current) canvasRef.current.style.visibility = 'hidden';
    };

    const el = map.getContainer();
    el.setAttribute('data-map-currents', 'true');
    el.setAttribute('data-map-currents-frame', String(frame));
    el.setAttribute('data-map-currents-max', sampleMax.toFixed(2));

    if (!reducedMotion) {
      // ── Modo animado: partículas advectadas na mesma grelha, com o engine
      // do campo de vento. Drift ∝ m/s da corrente (≈2–18 px/s) — movimento
      // calmo; os ticks continuam a ser o fallback de reduced-motion.
      const particles = flowParticlesRef.current;
      const budget = isMobile ? MAP_CURRENT_FLOW_PARTICLES_MOBILE : MAP_CURRENT_FLOW_PARTICLES;
      const strengthOf = (c: FlowCell) => currentFlowStrength(c.spd);

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
          south: b.getSouth() - 0.12,
          west: b.getWest() - 0.12,
          north: b.getNorth() + 0.12,
          east: b.getEast() + 0.12,
        };
      };
      const respawnAll = () => {
        particles.length = 0;
        const view = spawnView();
        for (let i = 0; i < budget; i++) {
          const p: CurrentFlowParticle = {
            lat: 0, lon: 0, px: 0, py: 0, hasPrev: false, life: 0, kt: 0, jit: 1,
          };
          if (spawnWindParticle(grids, view, p, Math.random, strengthOf)) particles.push(p);
        }
      };
      const clearCanvas = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of particles) p.hasPrev = false;
      };

      const tick = (t: number) => {
        rafRef.current = 0;
        if (document.hidden || isZoomAnimating(map)) {
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
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = `rgba(0,0,0,${MAP_CURRENT_FLOW_FADE})`;
        ctx.fillRect(0, 0, size.x, size.y);
        ctx.globalCompositeOperation = 'source-over';

        const view = spawnView();
        const zoom = map.getZoom();
        for (const p of particles) {
          if (!advectWindParticle(grids, p, dt, zoom, MAP_CURRENT_PX_PER_S_PER_MS)) {
            if (!spawnWindParticle(grids, view, p, Math.random, strengthOf)) p.life = 30;
          }
        }
        drawCurrentFlowParticles(
          ctx,
          particles,
          (lat, lon) => {
            const p = map.latLngToLayerPoint([lat, lon]);
            return { x: p.x - origin.x, y: p.y - origin.y };
          },
          colors,
          opacity,
          { width: size.x, height: size.y },
        );
        rafRef.current = requestAnimationFrame(tick);
      };

      const onZoomEnd = () => {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = requestAnimationFrame(() => {
            zoomRafRef.current = 0;
            canvas.style.visibility = '';
            clearCanvas();
            respawnAll();
          });
        });
      };

      respawnAll();
      map.on('zoomstart', onZoomStart);
      map.on('zoomend', onZoomEnd);
      map.on('move', clearCanvas);
      lastTRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        map.off('zoomstart', onZoomStart);
        map.off('zoomend', onZoomEnd);
        map.off('move', clearCanvas);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        if (zoomRafRef.current) {
          cancelAnimationFrame(zoomRafRef.current);
          zoomRafRef.current = 0;
        }
        particles.length = 0;
      };
    }

    // ── Reduced-motion: ticks estáticos (comportamento original) ──
    const schedule = () => {
      if (isZoomAnimating(map)) {
        if (canvasRef.current) canvasRef.current.style.visibility = 'hidden';
        return;
      }
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paint();
      });
    };

    const onZoomEnd = () => {
      // Nested rAF pair that repaints after the zoom animation settles. The
      // handles are stored so the effect cleanup cancels both — otherwise the
      // frames survive unmount, run against the destroyed map and throw
      // «Cannot read properties of undefined (reading 'save')» (CI 34075896616).
      zoomRafRef.current = requestAnimationFrame(() => {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = 0;
          if (canvasRef.current) canvasRef.current.style.visibility = '';
          paint();
        });
      });
    };

    map.on('zoomstart', onZoomStart);
    map.on('zoomend', onZoomEnd);
    map.on('moveend viewreset', schedule);
    map.on('move', schedule);
    paint();

    return () => {
      map.off('zoomstart', onZoomStart);
      map.off('zoomend', onZoomEnd);
      map.off('moveend viewreset', schedule);
      map.off('move', schedule);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = 0;
      }
    };
  }, [
    currentsOn,
    isReady,
    grids,
    sampleMax,
    frame,
    isMobile,
    opacity,
    reducedMotion,
    mapInstanceRef,
    LRef,
  ]);

  return {
    currentsEnabled: currentsOn,
    currentsUnavailable: fetchedFile === null || (!!file && !file.currents),
    toggleCurrents,
    currentsMax: sampleMax,
  };
}
