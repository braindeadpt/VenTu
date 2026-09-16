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
  isobathLineWeight,
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
  MAP_BATHYMETRY_LS_KEY,
  EMODNET_BATHYMETRY_WMS_URL,
  EMODNET_BATHYMETRY_WMS_LAYER,
  EMODNET_BATHYMETRY_CONTOURS_LAYER,
  EMODNET_BATHYMETRY_ATTRIBUTION,
  MAP_BATHYMETRY_PANE,
  MAP_BATHYMETRY_PANE_Z,
  MAP_SEAMARKS_LS_KEY,
  OPENSEAMAP_SEAMARKS_URL,
  OPENSEAMAP_ATTRIBUTION,
  MAP_SEAMARKS_PANE,
  MAP_SEAMARKS_PANE_Z,
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
  initialIsobathsEnabled: boolean;
  radarOverlayRef: React.MutableRefObject<L.ImageOverlay | null>;
  isobathsLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  coastalLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  t: {
    map: {
      showRadar: string;
      hideRadar: string;
      radarHint: string;
      showCoastalWarnings: string;
      hideCoastalWarnings: string;
    };
  };
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
  // Bathymetry (EMODnet WMS)
  bathymetryEnabled: boolean;
  toggleBathymetry: () => void;
  // Seamarks (OpenSeaMap raster tiles)
  seamarksEnabled: boolean;
  toggleSeamarks: () => void;
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
  initialIsobathsEnabled,
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

  // Lift overlay chips (radar carousel, score legend) above the HUD.
  useEffect(() => {
    if (!isFullscreen || !isReady) {
      if (!isFullscreen) setRadarLift(0);
      return;
    }
    const hud = document.querySelector('[data-map-hud-collapsed]');
    if (!hud) return;
    const measure = () => setRadarLift(hud.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hud);
    return () => ro.disconnect();
  }, [isFullscreen, isReady]);

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
    // Deep link ?isobaths=1 (partilhar o overlay) liga as isóbatas à entrada,
    // sobrepondo a preferência persistida SEM a gravar — o toggle manual é o
    // único dono da preferência depois disto (mesmo padrão do deep link ?radar=1).
    if (initialIsobathsEnabled) return true;
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
    const addLines = () => {
      const weight = isobathLineWeight(map.getZoom());
      for (const depth of ISOBATH_DEPTHS) {
        const lines = isobathsData.contours?.[String(depth)];
        if (!lines) continue;
        const style = ISOBATH_DEPTH_STYLE[depth];
        for (const line of lines) {
          const latlngs = line.map(([lon, lat]) => [lat, lon] as [number, number]);
          Leaflet.polyline(latlngs, {
            color: '#020617',
            weight: weight + 2.5,
            opacity: 0.55,
            lineJoin: 'round',
            lineCap: 'round',
            interactive: false,
            className: 'ventu-isobath-halo',
          }).addTo(group);
          Leaflet.polyline(latlngs, {
            color: style.color,
            weight,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round',
            interactive: false,
            className: 'ventu-isobath-line',
          }).addTo(group);
        }
      }
    };
    addLines();
    group.addTo(map);
    isobathsLayerRef.current = group;
    // Leaflet fires 'unload' synchronously at the START of map.remove(),
    // before layers/renderer teardown. React unmount order runs useMapCore's
    // map.remove() BEFORE this hook's cleanup detaches the zoomend handler,
    // and a zoomend can fire mid-removal from Leaflet's own zoom-animation
    // timer (onZoomTransitionEnd setTimeout) - after Canvas._destroyContainer
    // deleted _ctx but while our handler is still attached. Restyling then
    // schedules a renderer redraw whose rAF throws (reading 'save').
    // 'unload' is the earliest reliable teardown signal.
    let mapRemoved = false;
    const markRemoved = () => { mapRemoved = true; };
    map.once('unload', markRemoved);
    const onZoom = () => {
      if (mapRemoved || !mapInstanceRef.current) return;
      const weight = isobathLineWeight(map.getZoom());
      group.eachLayer((layer) => {
        const path = layer as L.Polyline;
        const halo = path.options.className === 'ventu-isobath-halo';
        path.setStyle({ weight: halo ? weight + 2.5 : weight });
      });
    };
    map.on('zoomend', onZoom);
    const attr = isPt
      ? 'Isóbatas © Instituto Hidrográfico (CC BY 4.0)'
      : 'Isobaths © Instituto Hidrográfico (CC BY 4.0)';
    map.attributionControl?.addAttribution(attr);

    return () => {
      mapRemoved = true;
      map.off('unload', markRemoved);
      map.off('zoomend', onZoom);
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

  // ── Bathymetry (EMODnet WMS) ──
  // Sombreado contínuo de profundidade — relevo submarino (bancos, canhões,
  // talude) por baixo das isóbatas. Tiles WMS keyless; camada opcional,
  // desligada por omissão, best-effort (falhas de tile não tocam no mapa).
  const [bathymetryEnabled, setBathymetryEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined' || isHeroEmbed) return false;
    try {
      return localStorage.getItem(MAP_BATHYMETRY_LS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!bathymetryEnabled || !isReady) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    if (!map || !Leaflet) return;

    let pane = map.getPane(MAP_BATHYMETRY_PANE);
    if (!pane) pane = map.createPane(MAP_BATHYMETRY_PANE);
    pane.style.zIndex = MAP_BATHYMETRY_PANE_Z;
    pane.style.pointerEvents = 'none';

    const layer = Leaflet.tileLayer.wms(EMODNET_BATHYMETRY_WMS_URL, {
      layers: EMODNET_BATHYMETRY_WMS_LAYER,
      format: 'image/png',
      transparent: true,
      opacity: 0.6,
      pane: MAP_BATHYMETRY_PANE,
      attribution: EMODNET_BATHYMETRY_ATTRIBUTION,
      className: 'ventu-bathymetry',
    });
    layer.addTo(map);

    // Contornos generalizados 50–5000 m no mesmo pane — adicionados DEPOIS do
    // sombreado para desenharem por cima. É a cobertura de profundidade das
    // ilhas (as isóbatas IH 8/16/30 m só existem no continente).
    const contours = Leaflet.tileLayer.wms(EMODNET_BATHYMETRY_WMS_URL, {
      layers: EMODNET_BATHYMETRY_CONTOURS_LAYER,
      format: 'image/png',
      transparent: true,
      opacity: 0.85,
      pane: MAP_BATHYMETRY_PANE,
      className: 'ventu-bathymetry-contours',
    });
    contours.addTo(map);

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (map.hasLayer(contours)) map.removeLayer(contours);
    };
  }, [bathymetryEnabled, isReady, mapInstanceRef, LRef]);

  const toggleBathymetry = useCallback(() => {
    setBathymetryEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_BATHYMETRY_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Seamarks (OpenSeaMap tiles) ──
  // Sinalização náutica (balizas, faróis, rochas, perigos, fundeadouros) —
  // contexto cartográfico para os avisos IH e as zonas de orca. Camada
  // opt-in: raster transparente por cima dos fields, por baixo dos markers.
  const [seamarksEnabled, setSeamarksEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined' || isHeroEmbed) return false;
    try {
      return localStorage.getItem(MAP_SEAMARKS_LS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!seamarksEnabled || !isReady) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    if (!map || !Leaflet) return;

    let pane = map.getPane(MAP_SEAMARKS_PANE);
    if (!pane) pane = map.createPane(MAP_SEAMARKS_PANE);
    pane.style.zIndex = MAP_SEAMARKS_PANE_Z;
    pane.style.pointerEvents = 'none';

    const layer = Leaflet.tileLayer(OPENSEAMAP_SEAMARKS_URL, {
      pane: MAP_SEAMARKS_PANE,
      opacity: 0.9,
      attribution: OPENSEAMAP_ATTRIBUTION,
      className: 'ventu-seamarks',
      maxZoom: 18,
    });
    layer.addTo(map);

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    };
  }, [seamarksEnabled, isReady, mapInstanceRef, LRef]);

  const toggleSeamarks = useCallback(() => {
    setSeamarksEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_SEAMARKS_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
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
    // Eventos de orca ANAV: ponto + raio (~25 km), sem polígono — desenham-se
    // como círculo tracejado âmbar para se distinguirem dos avisos (vermelho).
    const orcaEvents = coastalWarningsData.warnings?.filter(
      (w) =>
        w.collection === 'orca_anavnet_point' &&
        Array.isArray(w.center) &&
        typeof w.radiusKm === 'number' &&
        w.radiusKm > 0,
    ) ?? [];
    if (warnings.length === 0 && orcaEvents.length === 0) return;

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
        // Áreas de cobertura gigantes (ex.: aviso que abrange toda a costa —
        // caixas de dezenas de graus²) só com contorno tracejado: o fill a 18%
        // tapava o mapa inteiro e o path comia o hover/clique de todos os pins.
        let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
        for (const [la, lo] of latlngs) {
          if (la < minLa) minLa = la;
          if (la > maxLa) maxLa = la;
          if (lo < minLo) minLo = lo;
          if (lo > maxLo) maxLo = lo;
        }
        const isCoverage = (maxLa - minLa) * (maxLo - minLo) > 2;
        const poly = Leaflet.polygon(latlngs, isCoverage
          ? {
              color: '#ef4444', weight: 1.5, opacity: 0.7, fill: false,
              dashArray: '6 6', className: 'ventu-coastal-warning',
            }
          : {
              color: '#ef4444', weight: 2, opacity: 0.9, fillColor: '#ef4444', fillOpacity: 0.18,
              className: 'ventu-coastal-warning',
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
    for (const w of orcaEvents) {
      // A data do avistamento é parte da história — «há 12 dias», não só a ref.
      const when = w.eventAt
        ? new Intl.DateTimeFormat(isPt ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(w.eventAt))
        : null;
      const label = `${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''}${when ? ` · ${when}` : ''}`;
      const tooltipHtml = w.url
        ? `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`
        : label;
      const latlng: [number, number] = [w.center![1], w.center![0]];
      // Zona de influência (~25 km) — quase invisível; quem conta a história
      // é a barbatana. O círculo fica como contexto espacial discreto.
      const circle = Leaflet.circle(latlng, {
        radius: w.radiusKm! * 1000,
        color: '#f59e0b', weight: 1.2, opacity: 0.45, dashArray: '4 8',
        fillColor: '#f59e0b', fillOpacity: 0.03,
        className: 'ventu-orca-warning',
      }).bindTooltip(tooltipHtml, { sticky: true, direction: 'top', interactive: true });
      circle.addTo(group);
      // Marcador: barbatana dorsal de orca a emergir — o momento ANAV.
      const marker = Leaflet.marker(latlng, {
        interactive: true,
        keyboard: false,
        icon: Leaflet.divIcon({
          className: 'ventu-orca-marker',
          html:
            '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">' +
            '<circle cx="14" cy="16" r="11" fill="rgb(245 158 11 / 0.14)"/>' +
            '<path d="M3 21.5 q3.5 -2.6 7 0 t7 0 t7 0" fill="none" stroke="rgb(34 211 238)" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>' +
            '<path d="M14.2 4.5 C17.4 9 18.4 14.5 17.4 21 L10 21 C9.9 14.2 11 8.6 14.2 4.5 Z" fill="rgb(15 23 42)" stroke="rgb(226 232 240)" stroke-width="1" stroke-linejoin="round"/>' +
            '<ellipse cx="14.6" cy="15.8" rx="1.15" ry="2.1" fill="rgb(226 232 240)" transform="rotate(8 14.6 15.8)"/>' +
            '</svg>',
          iconSize: [28, 28],
          iconAnchor: [14, 22],
          tooltipAnchor: [0, -18],
        }),
      }).bindTooltip(tooltipHtml, { sticky: true, direction: 'top', interactive: true });
      if (w.url) {
        marker.on('click', (e: L.LeafletMouseEvent) => {
          Leaflet.DomEvent.stopPropagation(e);
          window.open(w.url, '_blank', 'noopener,noreferrer');
        });
      }
      marker.addTo(group);
    }
    group.addTo(map);
    coastalLayerRef.current = group;

    const container = map.getContainer();
    // Sinal próprio para "camada desenhada E câmara assente". O foco do deep
    // link corre um fitBounds animado: durante a animação os paths fora do
    // alvo ficam clipados (Leaflet escreve d="M0 0" → hidden). Marcar settled
    // só no moveend que fecha o enquadramento evita esse falso estado.
    const markCoastalSettled = () => { container.dataset.coastalWarningsSettled = 'true'; };

    // Deep link focus
    let focusAnimated = false;
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
        if (focus.isValid()) {
          // O listener regista-se ANTES do fitBounds: se o movimento for
          // instantâneo/no-op, o moveend dispara dentro da própria chamada.
          map.once('moveend', markCoastalSettled);
          focusAnimated = true;
          map.fitBounds(focus.pad(0.15), { maxZoom: 10, animate: true });
        }
      }
      coastalFocusDoneRef.current = true;
    }
    if (!focusAnimated) markCoastalSettled();

    const attr = isPt
      ? 'Avisos à Navegação Costeiros © Instituto Hidrográfico (CC BY 4.0)'
      : 'Coastal Navigation Warnings © Instituto Hidrográfico (CC BY 4.0)';
    map.attributionControl?.addAttribution(attr);
    container.dataset.coastalWarnings = 'true';

    return () => {
      map.off('moveend', markCoastalSettled);
      if (map.hasLayer(group)) map.removeLayer(group);
      coastalLayerRef.current = null;
      map.attributionControl?.removeAttribution(attr);
      container.removeAttribute('data-coastal-warnings');
      container.removeAttribute('data-coastal-warnings-settled');
    };
  }, [coastalWarningsEnabled, isReady, coastalWarningsData, isPt, focusSpotId, mapInstanceRef, LRef, coastalLayerRef]);

  const toggleCoastalWarnings = useCallback(() => {
    setCoastalWarningsEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_COASTAL_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  const coastalWarningsLabel = coastalWarningsEnabled
    ? t.map.hideCoastalWarnings
    : t.map.showCoastalWarnings;

  return {
    radarData, radarEnabled, radarFrameIndex, radarUserPaused, radarPrefSet,
    radarBusySources, radarLift, radarFrameIndexRef, radarUserPausedRef,
    toggleRadar, handleRadarFrameChange, handleRadarUserPausedChange,
    handleResetRadar, handleRadarImmersionOpen,
    radarFrameList, radarLabel, radarHint, radarUnavailable, radarAttributionLabel,
    isobathsEnabled, isobathsData, toggleIsobaths,
    bathymetryEnabled, toggleBathymetry,
    seamarksEnabled, toggleSeamarks,
    coastalWarningsEnabled, coastalWarningsData, toggleCoastalWarnings, coastalWarningsLabel,
  };
}
