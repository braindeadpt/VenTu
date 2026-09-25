'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import {
  MAP_WIND_FADE,
  MAP_WIND_PANE,
  MAP_WIND_PANE_Z,
  advectWindParticle,
  buildWindFieldGrids,
  collectWindSamples,
  drawWindParticles,
  spawnWindParticle,
  windParticleTarget,
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

/** Cap de desenho — 30 fps chegam para um campo ambiental e cortam o
 *  custo de pintura para metade (o gargalo é o fill de fade, não o JS). */
const WIND_FRAME_MS = 1000 / 30;
/** Ao fim de ~8 s sem interacção o campo congela o último frame — o mapa
 *  parado passa a custar ~zero. Qualquer gesto/dado novo acorda-o. */
const WIND_IDLE_PAUSE_MS = 8_000;
/** Canvas a DPR 1: ~4× menos píxeis por frame. As trails são linhas
 *  ambientais finas — a diferença é imperceptível até a 1440/DPR 2. */
const WIND_CANVAS_DPR = 1;

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
  const particlesRef = useRef<WindParticle[]>([]);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  // Reage a mudanças do SO/browser sem reload — antes ficava congelado no
  // valor do mount.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
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
    // Cor segue o tema — antes era lida uma vez no mount e ficava presa ao
    // tema inicial até o layer ser re-ligado.
    const colorRef = { current: cssRgbToken(host, '--data-wind', '167 139 250') };
    const particles = particlesRef.current;
    // §9 — o pool ajusta-se ao zoom em vez de um budget fixo (denso em z alto).
    const particleTarget = () => windParticleTarget(map.getZoom(), isMobile);

    const sizeCanvas = () => {
      const size = map.getSize();
      const dpr = WIND_CANVAS_DPR;
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
      const target = particleTarget();
      for (let i = 0; i < target; i++) {
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
            // §9 — mesmo tecto de 45% do modo animado.
            const a = Math.min(0.45, 0.18 + p.kt / 45) * (1 - k * k);
            ctx.strokeStyle = `rgb(${colorRef.current} / ${a.toFixed(3)})`;
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

    // §9 — fade-out em pan/zoom (gate de performance CORRECCOES-24SET M5):
    // durante o gesto o canvas desaparece (opacity 0, 200 ms) e o loop NÃO
    // advecta nem desenha — a M4 media long tasks até 654 ms porque o campo
    // competia com o compositor a cada frame de pan. Findo o fade o canvas
    // passa a `visibility:hidden` — um elemento opacity:0 continua a ser
    // rasterizado (o fill `destination-in` dos trails custa ~50-100 ms a
    // 4× CPU); hidden tira-o do paint por completo durante o gesto. Ao
    // assentar espera 600 ms, limpa, respawna no novo framing e volta a 1
    // (300 ms fade-in) — o intervalo cobre pans encadeados sem restaurar.
    const interacting = { current: false };
    let resumeTimer = 0;
    let watchdogTimer = 0;
    const setWindVisible = (visible: boolean, fadeMs: number) => {
      if (visible) {
        canvas.style.transition = `opacity ${fadeMs}ms linear`;
        canvas.style.visibility = 'visible';
        canvas.style.opacity = '1';
      } else {
        // Atraso igual ao fade — visibility só vira hidden quando o canvas
        // já está a 0 (visibility é animável de forma discreta em CSS).
        canvas.style.transition = `opacity ${fadeMs}ms linear, visibility 0s linear ${fadeMs}ms`;
        canvas.style.opacity = '0';
        canvas.style.visibility = 'hidden';
      }
      host.setAttribute('data-map-windfield-visible', visible ? 'true' : 'false');
    };

    // Pausa por inactividade — o último frame fica congelado no canvas e o
    // rAF para de ser agendado. `wake` (gesto no mapa, zoom, dados novos)
    // retoma o loop.
    const idle = { lastActive: performance.now(), paused: false };
    let frameAcc = 0;
    let lastT = 0;
    let framesDrawn = 0;
    let lastTargetAttr = -1;
    const tick = (t: number) => {
      rafRef.current = 0;
      if (idle.paused) return; // congelado — wake() retoma
      if (interacting.current || document.hidden || isZoomAnimating(map)) {
        // Continua a agendar — retoma quando visível/anim/gesto acabar.
        // Durante o gesto não se advecta nem desenha (zero trabalho de campo).
        rafRef.current = requestAnimationFrame(tick);
        lastT = t;
        return;
      }
      frameAcc += lastT ? t - lastT : WIND_FRAME_MS;
      lastT = t;
      // Cap ~30 fps: salta frames sem saltar tempo — o dt acumulado mantém
      // a velocidade visual das partículas.
      if (frameAcc < WIND_FRAME_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, frameAcc / 1000);
      frameAcc = 0;
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
      // §9 — densidade por zoom: o pool converge para o alvo do nível actual.
      const target = windParticleTarget(zoom, isMobile);
      if (target !== lastTargetAttr) {
        lastTargetAttr = target;
        host.setAttribute('data-map-windfield-target', String(target));
      }
      if (particles.length > target) particles.length = target;
      while (particles.length < target) {
        const np: WindParticle = { lat: 0, lon: 0, px: 0, py: 0, hasPrev: false, life: 0, kt: 0, jit: 1 };
        if (!spawnWindParticle(grids, view, np)) break;
        particles.push(np);
      }
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
        colorRef.current,
        isMobile ? 0.8 : 1,
        { width: size.x, height: size.y },
      );
      // Congela depois de desenhar este frame — o rasto fica visível.
      // O contador expõe o ritmo real de pintura (debug + e2e).
      framesDrawn += 1;
      host.setAttribute('data-map-windfield-frames', String(framesDrawn));
      if (t - idle.lastActive > WIND_IDLE_PAUSE_MS) {
        idle.paused = true;
        host.setAttribute('data-map-windfield-paused', 'true');
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const wake = () => {
      idle.lastActive = performance.now();
      if (idle.paused && !reducedMotion) {
        idle.paused = false;
        host.setAttribute('data-map-windfield-paused', 'false');
        frameAcc = 0;
        lastT = 0;
        if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
      }
    };

    // §9 — gesto de pan/zoom/drag: esconde (opacity 0, 200 ms) e suspende o
    // trabalho; ao assentar espera 600 ms e volta com fade-in de 300 ms.
    // movestart/zoomstart/dragstart cobrem arraste, pinch e fitBounds.
    // Os 600 ms cobrem gestos encadeados (pan-pausa-pan) sem repintar entre
    // eles — a M5 mediu ~1 s de raster do campo por stroke extra se o
    // restore fosse mais curto.
    const onGestureStart = () => {
      interacting.current = true;
      window.clearTimeout(resumeTimer);
      setWindVisible(false, 200);
      armWatchdog();
    };
    // Watchdog — um gesto que fica sem moveend/zoomend (animação flyTo
    // interrompida por setView, teardown a meio) deixava o canvas em
    // `visibility:hidden` para sempre. Se o mapa não emitir nenhum
    // move/zoomanim durante 2,5 s, o gesto considera-se morto e o campo
    // restaura pelo caminho normal.
    const armWatchdog = () => {
      window.clearTimeout(watchdogTimer);
      watchdogTimer = window.setTimeout(() => {
        watchdogTimer = 0;
        if (interacting.current) onGestureEnd();
      }, 2500);
    };
    const onGestureEnd = () => {
      window.clearTimeout(watchdogTimer);
      watchdogTimer = 0;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        resumeTimer = 0;
        interacting.current = false;
        // trails da vista/escala anterior não valem — repinta do zero.
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = map.getSize();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, size.x, size.y);
        }
        respawnAll();
        // Publica já o alvo do novo zoom — não espera pelo próximo frame
        // desenhado (o loop pode ainda estar a drenar o cap de 30 fps).
        const t = particleTarget();
        lastTargetAttr = t;
        host.setAttribute('data-map-windfield-target', String(t));
        setWindVisible(true, 300);
        if (reducedMotion) paintStatic();
      }, 600);
    };

    // A cor segue a classe de tema no <html>; em modo estático repinta já.
    const themeObs = new MutationObserver(() => {
      colorRef.current = cssRgbToken(host, '--data-wind', '167 139 250');
      host.setAttribute('data-map-windfield-color', colorRef.current);
      if (reducedMotion) paintStatic();
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    respawnAll();
    map.on('movestart', onGestureStart);
    map.on('zoomstart', onGestureStart);
    map.on('dragstart', onGestureStart);
    map.on('moveend', onGestureEnd);
    map.on('zoomend', onGestureEnd);
    map.on('dragend', onGestureEnd);
    // Gesto vivo: qualquer move/zoomanim re-arma o watchdog — só um gesto
    // parado há 2,5 s (sem evento de fim) é declarado morto.
    map.on('move', armWatchdog);
    map.on('zoomanim', armWatchdog);
    // Interacção acorda o campo da pausa por inactividade.
    map.on('movestart', wake);
    map.on('zoomstart', wake);
    host.addEventListener('pointermove', wake, { passive: true });
    host.addEventListener('pointerdown', wake, { passive: true });
    host.addEventListener('touchstart', wake, { passive: true });
    // §9 — o campo nasce a 0 e entra com fade de 300 ms (não «pisca»).
    canvas.style.opacity = '0';
    host.setAttribute('data-map-windfield-visible', 'false');
    requestAnimationFrame(() => setWindVisible(true, 300));
    if (reducedMotion) paintStatic();
    else {
      lastT = 0;
      rafRef.current = requestAnimationFrame(tick);
    }

    const el = map.getContainer();
    el.setAttribute('data-map-windfield', 'true');
    el.setAttribute('data-map-windfield-paused', 'false');
    el.setAttribute('data-map-windfield-color', colorRef.current);
    el.setAttribute('data-map-windfield-target', String(particleTarget()));

    return () => {
      themeObs.disconnect();
      map.off('movestart', onGestureStart);
      map.off('zoomstart', onGestureStart);
      map.off('dragstart', onGestureStart);
      map.off('moveend', onGestureEnd);
      map.off('zoomend', onGestureEnd);
      map.off('dragend', onGestureEnd);
      map.off('move', armWatchdog);
      map.off('zoomanim', armWatchdog);
      map.off('movestart', wake);
      map.off('zoomstart', wake);
      host.removeEventListener('pointermove', wake);
      host.removeEventListener('pointerdown', wake);
      host.removeEventListener('touchstart', wake);
      window.clearTimeout(resumeTimer);
      window.clearTimeout(watchdogTimer);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      const el2 = map.getContainer();
      if (el2) {
        el2.setAttribute('data-map-windfield', 'false');
        el2.removeAttribute('data-map-windfield-paused');
        el2.removeAttribute('data-map-windfield-frames');
        el2.removeAttribute('data-map-windfield-color');
        el2.removeAttribute('data-map-windfield-visible');
        el2.removeAttribute('data-map-windfield-target');
      }
    };
  }, [windOn, isReady, grids, isMobile, reducedMotion, mapInstanceRef, LRef]);

  return { windFieldOn: windOn, windFieldUnavailable: file !== null && !file?.wind };
}
