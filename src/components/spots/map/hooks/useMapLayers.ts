'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type L from 'leaflet';
import {
  fetchRadarData,
  radarBoundsCorners,
  radarFrames,
  type IpmaRadarData,
} from '@/lib/ipmaRadar';
import {
  readRadarEnabledPref,
  readRadarPref,
  writeRadarEnabledPref,
  writeRadarPref,
  resetRadarPref,
} from '@/lib/radarPrefs';
import {
  loadIsobathContours,
  ISOBATH_DEPTHS,
  ISOBATH_DEPTH_STYLE,
  type IsobathContoursFile,
} from '@/lib/isobaths';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
  type CoastalWarningsFile,
} from '@/lib/ihCoastalWarnings';
import {
  MAP_ISOBATHS_LS_KEY,
  MAP_COASTAL_LS_KEY,
} from '@/lib/map-constants';
import {
  IPMA_RADAR_ATTRIBUTION_LABEL_PT,
  IPMA_RADAR_ATTRIBUTION_LABEL_EN,
} from '@/lib/ipmaAttribution';

interface UseMapLayersOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isPt: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  focusSpotId?: string;
  initialRadarEnabled: boolean;
  radarOverlayRef: React.MutableRefObject<L.ImageOverlay | null>;
  isobathsLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  coastalLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  t: { map: { showRadar: string; hideRadar: string; radarHint: string } };
}

interface UseMapLayersReturn {
  // Radar
  radarData: IpmaRadarData | null | undefined;
  radarEnabled: boolean;
  radarFrameIndex: number;
  radarUserPaused: boolean;
  radarPrefSet: boolean;
  radarBusySources: Set<string>;
  radarLift: number;
  radarFrameIndexRef: React.MutableRefObject<number>;
  radarUserPausedRef: React.MutableRefObject<boolean>;
  toggleRadar: () => void;
  handleRadarFrameChange: (value: number) => void;
  handleRadarUserPausedChange: (paused: boolean) => void;
  handleResetRadar: () => void;
  handleRadarImmersionOpen: () => void;
  radarFrameList: Array<{ url: string; frameTime: string | null }>;
  radarLabel: string;
  radarHint: string;
  radarUnavailable: boolean;
  radarAttributionLabel: string;
  // Isobaths
  isobathsEnabled: boolean;
  isobathsData: IsobathContoursFile | null | undefined;
  toggleIsobaths: () => void;
  // Coastal warnings
  coastalWarningsEnabled: boolean;
  coastalWarningsData: CoastalWarningsFile | null | undefined;
  toggleCoastalWarnings: () => void;
  coastalWarningsLabel: string;
}

export function useMapLayers({
  mapInstanceRef,
  LRef,
  isReady,
  isPt,
  isFullscreen,
  isHeroEmbed,
  focusSpotId,
  initialRadarEnabled,
  radarOverlayRef,
  isobathsLayerRef,
  coastalLayerRef,
  t,
}: UseMapLayersOptions): UseMapLayersReturn {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Radar ──
  const [radarData, setRadarData] = useState<IpmaRadarData | null | undefined>(undefined);
  // Deep link ?radar=1 (ex: botão de imersão do carrossel) liga o radar à
  // entrada, sem tocar na preferência persistida (que só se grava ao desligar
  // ou ao toggle manual). Sem deep link, restaura a preferência de
  // ligar/desligar entre visitas (como o vento e o cluster).
  const [radarEnabled, setRadarEnabled] = useState<boolean>(() => {
    if (initialRadarEnabled) return true;
    if (typeof window === 'undefined') return false;
    return readRadarEnabledPref() === true;
  });
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [radarUserPaused, setRadarUserPaused] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return readRadarPref().paused;
  });
  const [radarPrefSet, setRadarPrefSet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return readRadarEnabledPref() !== undefined;
  });
  const [radarBusySources, setRadarBusySources] = useState<Set<string>>(new Set());
  const [radarLift, setRadarLift] = useState(0);
  const radarFrameIndexRef = useRef(0);
  const radarUserPausedRef = useRef(radarUserPaused);

  // Sync refs
  useEffect(() => { radarUserPausedRef.current = radarUserPaused; }, [radarUserPaused]);

  // A navegação client-side (Link do carrossel → /mapa?radar=1) pode entregar
  // a prop DEPOIS do primeiro render (o MapaFullscreenClient lê o URL num
  // useEffect). Sincronizar: liga quando a prop inicial pede; nunca desliga
  // por mudança de prop — o toggle manual é dono do estado a partir daqui.
  // setRadarEnabled (não toggleRadar): o deep link NÃO grava a preferência.
  useEffect(() => {
    if (initialRadarEnabled) setRadarEnabled(true);
  }, [initialRadarEnabled]);

  // Radar overlay effect
  useEffect(() => {
    if (!radarEnabled) {
      if (radarOverlayRef.current) {
        mapInstanceRef.current?.removeLayer(radarOverlayRef.current);
        radarOverlayRef.current = null;
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current) return;
    if (!LRef.current) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;

    if (radarData === undefined) {
      let cancelled = false;
      fetchRadarData().then((data) => {
        if (!cancelled && mountedRef.current) setRadarData(data);
      });
      return () => { cancelled = true; };
    }
    if (!radarData) return;

    const frames = radarFrames(radarData);
    const savedFrame = Math.max(0, Math.min(frames.length - 1, readRadarPref().frame));
    radarFrameIndexRef.current = savedFrame;
    setRadarFrameIndex(savedFrame);
    const overlay = Leaflet.imageOverlay(frames[savedFrame].url, Leaflet.latLngBounds(radarBoundsCorners(radarData)), {
      opacity: 0.8,
      attribution: radarData.attribution ?? 'IPMA',
    }).addTo(map);
    radarOverlayRef.current = overlay;

    return () => {
      if (map.hasLayer(overlay)) map.removeLayer(overlay);
      radarOverlayRef.current = null;
    };
  }, [radarEnabled, isReady, radarData, mapInstanceRef, LRef, radarOverlayRef]);

  // Drag/zoom busy tracking for radar
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const busy = (src: string) =>
      setRadarBusySources((prev) => {
        if (prev.has(src)) return prev;
        const next = new Set(prev);
        next.add(src);
        return next;
      });
    const idle = (src: string) =>
      setRadarBusySources((prev) => {
        if (!prev.has(src)) return prev;
        const next = new Set(prev);
        next.delete(src);
        return next;
      });
    const onMoveStart = () => busy('move');
    const onDragStart = () => busy('drag');
    const onZoomStart = () => busy('zoom');
    const onMoveEnd = () => idle('move');
    const onDragEnd = () => idle('drag');
    const onZoomEnd = () => idle('zoom');
    map.on('movestart', onMoveStart);
    map.on('dragstart', onDragStart);
    map.on('zoomstart', onZoomStart);
    map.on('moveend', onMoveEnd);
    map.on('dragend', onDragEnd);
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('movestart', onMoveStart);
      map.off('dragstart', onDragStart);
      map.off('zoomstart', onZoomStart);
      map.off('moveend', onMoveEnd);
      map.off('dragend', onDragEnd);
      map.off('zoomend', onZoomEnd);
    };
  }, [isReady, mapInstanceRef]);

  // HUD lift measurement for radar carousel
  useEffect(() => {
    if (!isFullscreen || !radarEnabled) return;
    const hud = document.querySelector('[data-map-hud-collapsed]');
    if (!hud) return;
    const measure = () => setRadarLift(hud.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hud);
    return () => ro.disconnect();
  }, [isFullscreen, radarEnabled]);

  const toggleRadar = useCallback(() => {
    setRadarPrefSet(true);
    setRadarEnabled((prev) => {
      const next = !prev;
      writeRadarEnabledPref(next);
      if (!next) writeRadarPref(radarUserPausedRef.current, radarFrameIndexRef.current);
      return next;
    });
  }, []);

  const handleRadarFrameChange = useCallback((value: number) => {
    const frames = radarFrames(radarData ?? null);
    if (frames.length === 0) return;
    const v = Math.max(0, Math.min(frames.length - 1, value));
    radarFrameIndexRef.current = v;
    setRadarFrameIndex(v);
    radarOverlayRef.current?.setUrl(frames[v].url);
    if (radarUserPausedRef.current) writeRadarPref(true, v);
  }, [radarData, radarOverlayRef]);

  const handleRadarUserPausedChange = useCallback((paused: boolean) => {
    radarUserPausedRef.current = paused;
    setRadarUserPaused(paused);
    writeRadarPref(paused, radarFrameIndexRef.current);
  }, []);

  const handleResetRadar = useCallback(() => {
    resetRadarPref();
    radarUserPausedRef.current = false;
    radarFrameIndexRef.current = 0;
    setRadarUserPaused(false);
    setRadarFrameIndex(0);
    setRadarEnabled(false);
    setRadarPrefSet(false);
  }, []);

  const handleRadarImmersionOpen = useCallback(() => {
    writeRadarPref(radarUserPausedRef.current, radarFrameIndexRef.current);
  }, []);

  const radarFrameList = radarFrames(radarData ?? null);
  const radarLabel = radarEnabled ? t.map.hideRadar : t.map.showRadar;
  const radarHint = t.map.radarHint;
  const radarUnavailable = radarData === null;
  const radarAttributionLabel = isPt ? IPMA_RADAR_ATTRIBUTION_LABEL_PT : IPMA_RADAR_ATTRIBUTION_LABEL_EN;

  // ── Isobaths ──
  const [isobathsEnabled, setIsIsobathsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (!isHeroEmbed && !isFullscreen) return false;
    const saved = (() => {
      try {
        const v = localStorage.getItem(MAP_ISOBATHS_LS_KEY);
        if (v === '1') return true;
        if (v === '0') return false;
      } catch { /* noop */ }
      return undefined;
    })();
    if (saved !== undefined) return saved;
    return isHeroEmbed;
  });
  const [isobathsData, setIsIsobathsData] = useState<IsobathContoursFile | null | undefined>(undefined);

  useEffect(() => {
    if (!isobathsEnabled) {
      if (isobathsLayerRef.current) {
        mapInstanceRef.current?.removeLayer(isobathsLayerRef.current);
        isobathsLayerRef.current = null;
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current) return;
    if (!LRef.current) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;

    if (isobathsData === undefined) {
      let cancelled = false;
      loadIsobathContours().then((data) => {
        if (!cancelled && mountedRef.current) setIsIsobathsData(data);
      });
      return () => { cancelled = true; };
    }
    if (!isobathsData) return;

    const group = Leaflet.layerGroup();
    for (const depth of ISOBATH_DEPTHS) {
      const lines = isobathsData.contours?.[String(depth)];
      if (!lines) continue;
      const style = ISOBATH_DEPTH_STYLE[depth];
      for (const line of lines) {
        const latlngs = line.map(([lon, lat]) => [lat, lon] as [number, number]);
        Leaflet.polyline(latlngs, { color: style.color, weight: 2, opacity: 0.85 }).addTo(group);
      }
    }
    group.addTo(map);
    isobathsLayerRef.current = group;
    const attr = isPt
      ? 'Isóbatas © Instituto Hidrográfico (CC BY 4.0)'
      : 'Isobaths © Instituto Hidrográfico (CC BY 4.0)';
    map.attributionControl?.addAttribution(attr);

    return () => {
      if (map.hasLayer(group)) map.removeLayer(group);
      isobathsLayerRef.current = null;
      map.attributionControl?.removeAttribution(attr);
    };
  }, [isobathsEnabled, isReady, isobathsData, isPt, mapInstanceRef, LRef, isobathsLayerRef]);

  const toggleIsobaths = useCallback(() => {
    setIsIsobathsEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_ISOBATHS_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Coastal Warnings ──
  const [coastalWarningsEnabled, setCoastalWarningsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(MAP_COASTAL_LS_KEY) === '1';
    } catch { return false; }
  });
  const [coastalWarningsData, setCoastalWarningsData] = useState<CoastalWarningsFile | null | undefined>(undefined);
  const coastalFocusDoneRef = useRef(false);

  // Deep link ?spot=<slug> auto-enable coastal warnings
  useEffect(() => {
    if (!focusSpotId) return;
    if (coastalFocusDoneRef.current) return;
    let cancelled = false;
    loadCoastalNavWarnings().then((file) => {
      if (cancelled || !file) return;
      const covering = warningsForSpot(file, focusSpotId)?.filter(
        (w) => Array.isArray(w.polygons) && w.polygons.length > 0,
      ) ?? [];
      if (covering.length === 0) return;
      setCoastalWarningsData(file);
      setCoastalWarningsEnabled(true);
    });
    return () => { cancelled = true; };
  }, [focusSpotId]);

  useEffect(() => {
    if (!coastalWarningsEnabled) {
      if (coastalLayerRef.current) {
        mapInstanceRef.current?.removeLayer(coastalLayerRef.current);
        coastalLayerRef.current = null;
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current) return;
    if (!LRef.current) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;

    if (coastalWarningsData === undefined) {
      let cancelled = false;
      loadCoastalNavWarnings().then((data) => {
        if (!cancelled && mountedRef.current) setCoastalWarningsData(data);
      });
      return () => { cancelled = true; };
    }
    if (!coastalWarningsData) return;

    const warnings = coastalWarningsData.warnings?.filter(
      (w) => Array.isArray(w.polygons) && w.polygons.length > 0,
    ) ?? [];
    if (warnings.length === 0) return;

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const group = Leaflet.layerGroup();
    for (const w of warnings) {
      for (const ring of w.polygons!) {
        const latlngs = ring.map(([ringLon, ringLat]) => [ringLat, ringLon] as [number, number]);
        const url = w.url;
        const tooltipHtml = url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''} ↗</a>`
          : `${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''}`;
        const poly = Leaflet.polygon(latlngs, {
          color: '#ef4444', weight: 2, opacity: 0.9, fillColor: '#ef4444', fillOpacity: 0.18,
        }).bindTooltip(tooltipHtml, { sticky: true, direction: 'top', interactive: true });
        if (url) {
          poly.on('click', (e: L.LeafletMouseEvent) => {
            Leaflet.DomEvent.stopPropagation(e);
            window.open(url, '_blank', 'noopener,noreferrer');
          });
        }
        poly.addTo(group);
      }
    }
    group.addTo(map);
    coastalLayerRef.current = group;

    // Deep link focus
    if (focusSpotId && !coastalFocusDoneRef.current && isReady) {
      const covering = warningsForSpot(coastalWarningsData, focusSpotId)?.filter(
        (w) => Array.isArray(w.polygons) && w.polygons.length > 0,
      ) ?? [];
      if (covering.length > 0) {
        const focus = Leaflet.latLngBounds([]);
        for (const w of covering) {
          for (const ring of w.polygons!) {
            for (const [ringLon, ringLat] of ring) focus.extend([ringLat, ringLon]);
          }
        }
        if (focus.isValid()) map.fitBounds(focus.pad(0.15), { maxZoom: 10, animate: true });
      }
      coastalFocusDoneRef.current = true;
    }

    const attr = isPt
      ? 'Avisos à Navegação Costeiros © Instituto Hidrográfico (CC BY 4.0)'
      : 'Coastal Navigation Warnings © Instituto Hidrográfico (CC BY 4.0)';
    map.attributionControl?.addAttribution(attr);
    map.getContainer().dataset.coastalWarnings = 'true';

    return () => {
      if (map.hasLayer(group)) map.removeLayer(group);
      coastalLayerRef.current = null;
      map.attributionControl?.removeAttribution(attr);
      map.getContainer().removeAttribute('data-coastal-warnings');
    };
  }, [coastalWarningsEnabled, isReady, coastalWarningsData, isPt, focusSpotId, mapInstanceRef, LRef, coastalLayerRef]);

  const toggleCoastalWarnings = useCallback(() => {
    setCoastalWarningsEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_COASTAL_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  const coastalWarningsLabel = coastalWarningsEnabled ? 'Ocultar avisos à navegação' : 'Avisos à navegação (IH)';

  return {
    radarData, radarEnabled, radarFrameIndex, radarUserPaused, radarPrefSet,
    radarBusySources, radarLift, radarFrameIndexRef, radarUserPausedRef,
    toggleRadar, handleRadarFrameChange, handleRadarUserPausedChange,
    handleResetRadar, handleRadarImmersionOpen,
    radarFrameList, radarLabel, radarHint, radarUnavailable, radarAttributionLabel,
    isobathsEnabled, isobathsData, toggleIsobaths,
    coastalWarningsEnabled, coastalWarningsData, toggleCoastalWarnings, coastalWarningsLabel,
  };
}
