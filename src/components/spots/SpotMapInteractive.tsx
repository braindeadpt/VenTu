'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Anchor, CloudRain, Layers, HelpCircle, MapPin, Maximize2, RotateCcw, Waves, Wind, Zap } from 'lucide-react';
import type L from 'leaflet';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { clearLeafletContainer, unlockPageInteraction } from '@/lib/mapFullscreen';
import type { GridSportFilter } from '@/lib/sportRatings';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';
import MapExploreHud, { type MapExploreHudProps } from './MapExploreHud';
import BuoyLayerChip from './BuoyLayerChip';
import BuoyLayerNotice from './BuoyLayerNotice';
import MapSpotSheet, { type MapSpotSheetData } from './MapSpotSheet';
import MapLegend from './MapLegend';
import MapLayerToggle from './MapLayerToggle';
import WindRingLegend from './WindRingLegend';
import type { BasemapMode } from './MapLayerToggle';
import { createClusterIconFunction } from './MapClusterIcon';
import {
  TILE_URLS,
  TILE_ATTRIBUTIONS,
  OPEN_METEO_ATTRIBUTION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  SPOT_REGION_ZOOM,
  MAX_ZOOM,
  CLUSTER_CONFIG,
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
  MAP_ISOBATHS_LS_KEY,
  MAP_COASTAL_LS_KEY,
} from '@/lib/map-constants';
import { getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { hasSeenWindRingLegend } from '@/lib/windRingLegend';
import { getSpotImage } from '@/lib/spotImage';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import {
  IPMA_RADAR_ATTRIBUTION_LABEL_PT,
  IPMA_RADAR_ATTRIBUTION_LABEL_EN,
} from '@/lib/ipmaAttribution';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import { strongestSpotWarning, warningBadgeLabel } from '@/lib/ipmaWarnings';
import {
  fetchRadarData,
  radarBoundsCorners,
  radarFrames,
  type IpmaRadarData,
} from '@/lib/ipmaRadar';
import { SEA_STATE_WARNING_TYPES } from '@/lib/ipmaWarnings';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import RadarCarousel from './RadarCarousel';
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
import { spotMeetsOnFilter } from '@/lib/gridSpotFilters';
import type { MapSpotData } from './mapSpotData';
import { getBestScore } from './mapSpotData';
import { includeSpotInViewportBounds } from './mapViewportBounds';
import {
  readClusterPref,
  readWindPref,
  readOnlyOnPref,
  readIsobathsPref,
  readCoastalWarningsPref,
} from './mapHudPrefs';
import {
  readRadarEnabledPref,
  readRadarPref,
  writeRadarEnabledPref,
  writeRadarPref,
  resetRadarPref,
} from '@/lib/radarPrefs';
import {
  buildMarkerCacheKey,
  createSpotMarker,
  runChunked,
  MARKER_ADD_CHUNK_SIZE,
  MARKER_ADD_CHUNK_SIZE_MOBILE,
  MARKER_CHUNK_YIELD_MS_MOBILE,
} from './mapMarkers';

// ─── Imports for hooks and sub-components ───
import { useMapCore } from './map/hooks/useMapCore';
import { useMapLayers } from './map/hooks/useMapLayers';
import MapControls from './map/components/MapControls';

type SpotData = MapSpotData;

type MapHudProps = Omit<
  MapExploreHudProps,
  | 'isPt'
  | 'visible'
  | 'basemapMode'
  | 'onBasemapChange'
  | 'clusterEnabled'
  | 'onToggleCluster'
  | 'radarEnabled'
  | 'onToggleRadar'
  | 'radarLabel'
  | 'radarHint'
  | 'isobathsEnabled'
  | 'onToggleIsobaths'
  | 'isobathsLabel'
  | 'isobathsHint'
  | 'coastalWarningsEnabled'
  | 'onToggleCoastalWarnings'
  | 'coastalWarningsLabel'
  | 'coastalWarningsHint'
  | 'windEnabled'
  | 'showWindOnMarkers'
  | 'onToggleWind'
  | 'onlyOnEnabled'
  | 'onToggleOnlyOn'
  | 'onlyOnLabel'
  | 'onlyOnHint'
  | 'onExitFullscreen'
  | 'windHint'
  | 'exploreModeLabel'
  | 'layerMapLabel'
  | 'layerSatelliteLabel'
  | 'clusterLabel'
  | 'windLabel'
  | 'exitLabel'
  | 'windLegendHelpLabel'
  | 'onOpenWindLegend'
  | 'windButtonRef'
  | 'collapseHudLabel'
  | 'expandHudLabel'
  | 'onCollapsedChange'
>;

interface SpotMapInteractiveProps {
  spotsData: SpotData[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  onSpotSelect?: (spotId: string) => void;
  mapHud?: MapHudProps;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  embedMode?: 'default' | 'hero';
  initialFullscreen?: boolean;
  initialRadarEnabled?: boolean;
  initialIsobathsEnabled?: boolean;
  focusSpotId?: string;
  initialCenter?: [number, number] | undefined;
  fullscreenBelowHeader?: boolean;
  onExitFullscreen?: () => void;
}

export default function SpotMapInteractive({
  spotsData,
  selectedSport,
  selectedRegion,
  locale,
  onSpotSelect,
  mapHud,
  onFullscreenChange,
  embedMode = 'default',
  initialFullscreen = false,
  initialRadarEnabled = false,
  initialIsobathsEnabled = false,
  focusSpotId,
  initialCenter,
  fullscreenBelowHeader = false,
  onExitFullscreen: onExitFullscreenOverride,
}: SpotMapInteractiveProps) {
  const isHeroEmbed = embedMode === 'hero';
  const mapRef = useRef<HTMLDivElement>(null);
  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  const windButtonRef = useRef<HTMLButtonElement>(null);
  const windLegendAutoQueuedRef = useRef(false);
  const didFitBoundsRef = useRef(false);
  const filterBoundsKeyRef = useRef('');
  const onSpotSelectRef = useRef(onSpotSelect);
  const mountedRef = useRef(true);
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    onSpotSelectRef.current = onSpotSelect;
  }, [onSpotSelect]);

  const isPt = locale === 'pt';
  const t = getTranslation(validateLocale(locale));

  // ── Core map ──
  const core = useMapCore({ containerRef: mapRef, isHeroEmbed });
  const {
    mapInstanceRef, LRef, isReady, isDark, basemapMode, isMobile,
    handleBasemapChange, tileLayerRef, clusterGroupRef, markersGroupRef,
    radarOverlayRef, isobathsLayerRef, coastalLayerRef, markersCacheRef,
  } = core;

  // ── Toggle state ──
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const [windEnabled, setWindEnabled] = useState(readWindPref);
  const [onlyOnEnabled, setOnlyOnEnabled] = useState(readOnlyOnPref);
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [sheetSpot, setSheetSpot] = useState<MapSpotSheetData | null>(null);
  const [hudCollapsed, setHudCollapsed] = useState(true);
  const [allowMarkers, setAllowMarkers] = useState(false);
  const [windLegendOpen, setWindLegendOpen] = useState(false);

  const showWindOnMarkers = windEnabled && !clusterEnabled && !isHeroEmbed;
  const activeCluster = isHeroEmbed ? true : clusterEnabled;

  // ── Layers ──
  const layers = useMapLayers({
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
  });
  const {
    radarData, radarEnabled, radarFrameIndex, radarUserPaused, radarPrefSet,
    radarBusySources, radarLift, radarFrameIndexRef, radarUserPausedRef,
    toggleRadar, handleRadarFrameChange, handleRadarUserPausedChange,
    handleResetRadar, handleRadarImmersionOpen,
    radarFrameList, radarLabel, radarHint, radarUnavailable, radarAttributionLabel,
    isobathsEnabled, isobathsData, toggleIsobaths,
    coastalWarningsEnabled, coastalWarningsData, toggleCoastalWarnings, coastalWarningsLabel,
  } = layers;

  // Deep link ?radar=1 handled by useMapLayers initial state —
  // sem tocar na preferência persistida (que só se grava ao desligar
  // ou ao toggle manual).
  useEffect(() => {
    if (initialIsobathsEnabled) toggleIsobaths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O crédito do basemap troca no controlo (Esri/OSM no satélite · Carto/OSM
  // no mapa). O AttributionControl do Leaflet mantém um CONTADOR de
  // referências por texto (add/removeAttribution incrementa/decrementa), e o
  // tile inicial regista o Carto no onAdd — um único removeAttribution não o
  // levaria a 0. Por isso REGRAVA-SE exactamente o conjunto pretendido
  // (Open-Meteo + basemap + créditos IH activos) em _attributions e chama-se
  // _update() — determinístico, sem contadores vazados, em todas as
  // superfícies incluindo o hero embebido com basemap satellite persistido.
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const attribution = basemapMode === 'satellite' ? TILE_ATTRIBUTIONS.esri : TILE_ATTRIBUTIONS.carto;
    const ac = map.attributionControl as any;
    if (ac) {
      const attribs: Record<string, number> = {};
      const bump = (t: string) => {
        attribs[t] = (attribs[t] ?? 0) + 1;
      };
      bump(OPEN_METEO_ATTRIBUTION);
      bump(attribution);
      if (isobathsEnabled && isobathsData != null) {
        bump(
          isPt ? 'Isóbatas © Instituto Hidrográfico (CC BY 4.0)' : 'Isobaths © Instituto Hidrográfico (CC BY 4.0)',
        );
      }
      if (coastalWarningsEnabled && coastalWarningsData != null) {
        bump(
          isPt
            ? 'Avisos à Navegação Costeiros © Instituto Hidrográfico (CC BY 4.0)'
            : 'Coastal Navigation Warnings © Instituto Hidrográfico (CC BY 4.0)',
        );
      }
      ac._attributions = attribs;
      ac._update();
    }
    // Este efeito NÃO deve re-correr quando os toggles IH mudam (só lê o estado
    // actual para a fotografia do controlo; os efeitos IH gerem os seus créditos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapMode, isDark, isReady]);

  // ── Warnings ──
  const warningsData = useIpmaWarnings();

  // ── Fullscreen ──
  const enterFullscreen = useCallback(() => {
    prevFocusRef.current = document.activeElement;
    setIsFullscreen(true);
  }, []);
  const exitFullscreen = useCallback(() => {
    setSheetSpot(null);
    if (onExitFullscreenOverride) onExitFullscreenOverride();
    else setIsFullscreen(false);
    unlockPageInteraction();
  }, [onExitFullscreenOverride]);
  useEffect(() => { onFullscreenChange?.(isFullscreen); }, [isFullscreen, onFullscreenChange]);
  useEffect(() => {
    if (isFullscreen) {
      requestAnimationFrame(() => {
        const exitBtn = document.querySelector<HTMLElement>('[data-map-exit-fullscreen]');
        exitBtn?.focus();
      });
    } else if (prevFocusRef.current instanceof HTMLElement) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [isFullscreen]);
  useEffect(() => {
    if (!isFullscreen) { unlockPageInteraction(); return; }
    document.body.classList.add('ventu-map-fullscreen-open');
    document.body.style.overflow = 'hidden';
    return () => { unlockPageInteraction(); };
  }, [isFullscreen]);
  useEffect(() => {
    if (isFullscreen) setHudCollapsed(true);
  }, [isFullscreen]);

  // ── Toggle handlers ──
  const toggleCluster = useCallback(() => {
    setClusterEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_CLUSTER_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);
  const toggleWind = useCallback(() => {
    setWindEnabled((prev) => {
      const next = !prev;
      if (next) {
        setClusterEnabled(false);
        try { localStorage.setItem(MAP_CLUSTER_LS_KEY, '0'); } catch { /* noop */ }
      }
      try { localStorage.setItem(MAP_WIND_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);
  const toggleOnlyOn = useCallback(() => {
    setOnlyOnEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_ONLY_ON_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Wind legend ──
  const openWindLegend = useCallback(() => { setWindLegendOpen(true); }, []);
  const closeWindLegend = useCallback(() => { setWindLegendOpen(false); }, []);
  useEffect(() => {
    if (!isReady || !showWindOnMarkers || isHeroEmbed) return;
    if (windLegendAutoQueuedRef.current || hasSeenWindRingLegend()) return;
    windLegendAutoQueuedRef.current = true;
    const open = () => setWindLegendOpen(true);
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(open, { timeout: 4000 });
    } else {
      timeoutId = window.setTimeout(open, 2000);
    }
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isReady, showWindOnMarkers, isHeroEmbed]);

  // ── Escape key ──
  useEffect(() => {
    if (!isFullscreen && !sheetSpot) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sheetSpot) { e.preventDefault(); setSheetSpot(null); return; }
      if (isFullscreen) exitFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, sheetSpot, exitFullscreen]);

  // ── Popup click handler ──
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.ventu-popup-detail');
      if (!btn) return;
      if (!onSpotSelectRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const spotId = btn.getAttribute('data-spot-id');
      if (spotId) onSpotSelectRef.current(spotId);
    };
    container.addEventListener('click', onClick, true);
    return () => container.removeEventListener('click', onClick, true);
  }, [isReady, mapInstanceRef]);

  // ── Initial center deep link ──
  const initialCenterDoneRef = useRef(false);
  useEffect(() => {
    if (!initialCenter || initialCenterDoneRef.current || !isReady) return;
    if (!mapInstanceRef.current) return;
    initialCenterDoneRef.current = true;
    mapInstanceRef.current.setView(initialCenter, SPOT_REGION_ZOOM, { animate: false });
    // Mark centering complete so tests can wait for it instead of racing
    // the map init (which exposes __RADAR_MAP__ before setView runs).
    if (typeof window !== 'undefined' && (window as any).__RADAR_TEST__) {
      (window as any).__RADAR_CENTERED__ = true;
    }
  }, [initialCenter, isReady, mapInstanceRef]);

  // ── Visible spots ──
  const visibleSpots = useMemo(() => {
    if (!onlyOnEnabled) return spotsData;
    return spotsData.filter((d) => spotMeetsOnFilter(d, selectedSport));
  }, [spotsData, onlyOnEnabled, selectedSport]);

  // ── Warnings by spot ──
  const warningsBySpot = useMemo(() => {
    const map = new Map<string, MapMarkerWarning>();
    if (!warningsData) return map;
    for (const data of visibleSpots) {
      const w = strongestSpotWarning(warningsData, data.spot.id);
      if (w) map.set(data.spot.id, { level: w.level, label: warningBadgeLabel(w, isPt), seaState: SEA_STATE_WARNING_TYPES.has(w.type) });
    }
    return map;
  }, [warningsData, visibleSpots, isPt]);

  // ── Labels ──
  const exitFullscreenLabel = t.map.exitFullscreen;
  const clusterLabel = clusterEnabled ? t.map.showAllSpots : t.map.clusterSpots;
  const windLabel = windEnabled ? t.map.hideWind : t.map.showWind;
  const windHint = clusterEnabled && windEnabled ? t.map.windNeedsShowAll : null;
  const onlyOnLabel = onlyOnEnabled ? t.map.onlyOnOff : t.map.onlyOn;
  const onlyOnHint = t.map.onlyOnHint;
  const windLegendHelpLabel = t.map.windRingLegend.help;
  const hudSpotCount = onlyOnEnabled ? visibleSpots.length : (mapHud?.spotCount ?? visibleSpots.length);

  // ── Markers effect ──
  useEffect(() => {
    if (!allowMarkers || !isReady || !mapInstanceRef.current || !clusterGroupRef.current || !markersGroupRef.current) return;
    if (!LRef.current) return;

    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    const mcg = clusterGroupRef.current;
    const lg = markersGroupRef.current;
    const cache = markersCacheRef.current;

    map.closePopup();
    setSheetSpot(null);
    mcg.clearLayers();
    lg.clearLayers();

    if (activeCluster) {
      if (map.hasLayer(lg)) map.removeLayer(lg);
      if (!map.hasLayer(mcg)) map.addLayer(mcg);
    } else {
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      if (!map.hasLayer(lg)) map.addLayer(lg);
    }

    const boundsKey = `${visibleSpots.length}:${onlyOnEnabled}:${selectedSport}:${selectedRegion}`;
    if (filterBoundsKeyRef.current !== boundsKey) {
      filterBoundsKeyRef.current = boundsKey;
      didFitBoundsRef.current = false;
    }

    if (visibleSpots.length === 0) return;

    const nextIds = new Set(visibleSpots.map((d) => d.spot.id));
    for (const [id, marker] of cache) {
      if (!nextIds.has(id)) { marker.remove(); cache.delete(id); }
    }

    const bounds = Leaflet.latLngBounds([]);
    const useMobileSheet = isMobile;
    const chunkSize = isMobile ? MARKER_ADD_CHUNK_SIZE_MOBILE : MARKER_ADD_CHUNK_SIZE;
    const yieldMs = isMobile ? MARKER_CHUNK_YIELD_MS_MOBILE : 0;

    const fitBoundsIfNeeded = () => {
      if (didFitBoundsRef.current || !bounds.isValid() || !mapInstanceRef.current) return;
      const fitMap = mapInstanceRef.current!;
      fitMap.invalidateSize({ animate: false });
      if (isHeroEmbed) {
        const leftPad = isMobile ? 20 : 300;
        fitMap.fitBounds(bounds, { paddingTopLeft: Leaflet.point(leftPad, 48), paddingBottomRight: Leaflet.point(40, 96), maxZoom: isMobile ? 8 : 10, animate: false });
      } else {
        const fitMaxZoom = isMobile ? 9 : 11;
        fitMap.fitBounds(bounds, { padding: isMobile ? [16, 16] : [40, 40], maxZoom: fitMaxZoom, animate: false });
      }
      didFitBoundsRef.current = true;
    };

    const markerChunkCancelRef = { current: false };
    runChunked(
      visibleSpots,
      (batch) => {
        const toCluster: L.Marker[] = [];
        const toPlain: L.Marker[] = [];
        for (const data of batch) {
          const warning = warningsBySpot.get(data.spot.id) ?? null;
          const cacheKey = buildMarkerCacheKey(data, selectedSport, showWindOnMarkers, locale, useMobileSheet, warning?.level ?? null);
          let marker = cache.get(data.spot.id);
          const meta = marker as (L.Marker & { ventuKey?: string }) | undefined;
          if (!marker || meta?.ventuKey !== cacheKey) {
            if (marker) { marker.remove(); cache.delete(data.spot.id); }
            marker = createSpotMarker(Leaflet, data, selectedSport, locale, showWindOnMarkers, {
              useMobileSheet,
              onMobileTap: (d) => setSheetSpot({ ...d, warning: warningsBySpot.get(d.spot.id) ?? null }),
              onSpotSelect,
              warning: warningsBySpot.get(data.spot.id) ?? null,
            });
            (marker as L.Marker & { ventuKey?: string }).ventuKey = cacheKey;
            cache.set(data.spot.id, marker);
          }
          if (activeCluster) toCluster.push(marker);
          else toPlain.push(marker);
          if (includeSpotInViewportBounds(data.spot, selectedRegion)) bounds.extend([data.spot.lat, data.spot.lon]);
        }
        if (toCluster.length > 0) mcg.addLayers(toCluster);
        if (toPlain.length > 0) toPlain.forEach((m) => lg.addLayer(m));
      },
      markerChunkCancelRef,
      fitBoundsIfNeeded,
      chunkSize,
      yieldMs,
    );

    return () => { markerChunkCancelRef.current = true; };
  }, [allowMarkers, visibleSpots, onlyOnEnabled, selectedSport, selectedRegion, isReady, clusterEnabled, showWindOnMarkers, locale, onSpotSelect, isMobile, isHeroEmbed, activeCluster, warningsBySpot, mapInstanceRef, LRef, clusterGroupRef, markersGroupRef, markersCacheRef]);

  // ── Allow markers after delay ──
  useEffect(() => {
    if (!isReady) { setAllowMarkers(false); return; }
    const delay = isMobile ? 280 : 0;
    const t = window.setTimeout(() => setAllowMarkers(true), delay);
    return () => window.clearTimeout(t);
  }, [isReady, isMobile]);

  // ── Hero fit bounds ──
  useEffect(() => {
    if (!isHeroEmbed || !isReady || !mapInstanceRef.current || !mapRef.current) return;
    const host = mapRef.current.closest('[data-map-hero-teaser]');
    if (!host) return;
    const map = mapInstanceRef.current;
    if (!LRef.current) return;
    const Leaflet = LRef.current;

    const fitHero = () => {
      const bounds = Leaflet.latLngBounds([]);
      visibleSpots.forEach((data) => {
        if (includeSpotInViewportBounds(data.spot, selectedRegion)) bounds.extend([data.spot.lat, data.spot.lon]);
      });
      if (!bounds.isValid()) return;
      map.invalidateSize({ animate: false });
      const leftPad = isMobile ? 20 : 300;
      map.fitBounds(bounds, { paddingTopLeft: Leaflet.point(leftPad, 48), paddingBottomRight: Leaflet.point(40, 96), maxZoom: isMobile ? 8 : 10, animate: false });
    };

    const ro = new ResizeObserver(() => fitHero());
    ro.observe(host);
    const t1 = window.setTimeout(fitHero, 0);
    const t2 = window.setTimeout(fitHero, 150);
    const t3 = window.setTimeout(fitHero, 500);
    return () => { ro.disconnect(); window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [isHeroEmbed, isReady, visibleSpots, selectedRegion, isMobile, mapInstanceRef, LRef]);

  // ── Performance measurement ──
  const perfMeasure = useCallback((label: string) => {
    if (typeof performance !== 'undefined') {
      performance.mark(`ventu-map-${label}`);
      const entries = performance.getEntriesByType('measure').filter((e) => e.name.startsWith('ventu-map-'));
      if (entries.length > 1) {
        const last = entries[entries.length - 1] as PerformanceMeasure;
        if (last.duration > 0) console.log(`[map perf] ${label}: ${Math.round(last.duration)}ms`);
      }
    }
  }, []);

  // ── Invalidate size on fullscreen/resize ──
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const sync = () => map.invalidateSize({ animate: false });
    sync();
    const t = window.setTimeout(sync, isMobile ? 100 : 150);
    return () => { window.clearTimeout(t); };
  }, [isFullscreen, isReady, isMobile, mapInstanceRef]);

  // ── Basemap toggle (also used by MapLayerToggle) ──
  const handleBasemapChangeLocal = useCallback((mode: BasemapMode) => {
    handleBasemapChange(mode);
  }, [handleBasemapChange]);

  return (
    <div
      className={
        isFullscreen
          ? fullscreenBelowHeader
            ? 'fixed left-0 right-0 bottom-0 z-40 w-full overflow-visible bg-surface-1/[0.04] top-16'
            : 'fixed inset-0 z-[1100] w-full overflow-visible bg-surface-1/[0.04] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : isHeroEmbed
            ? 'absolute inset-0 overflow-hidden bg-bg-base'
            : 'relative w-full rounded-2xl border border-divider overflow-hidden bg-surface-1/[0.04]'
      }
      style={
        isFullscreen
          ? fullscreenBelowHeader
            ? { height: 'calc(100dvh - 4rem)' }
            : { height: '100dvh' }
          : isHeroEmbed
            ? undefined
            : { height: 'clamp(300px, 50vh, 600px)' }
      }
      data-map-fullscreen={isFullscreen ? 'true' : 'false'}
      data-map-hud={isFullscreen && mapHud ? 'visible' : 'hidden'}
      data-map-cluster={clusterEnabled ? 'true' : 'false'}
      data-map-wind={showWindOnMarkers ? 'true' : 'false'}
      data-map-only-on={onlyOnEnabled ? 'true' : 'false'}
      data-map-hero-teaser={isHeroEmbed ? 'true' : undefined}
    >
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04] z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
            <span className="text-sm text-fg-muted">{t.map.loading}</span>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" aria-label={isPt ? 'Mapa dos spots' : 'Spots map'} />

      {isReady && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-[min(92%,460px)] px-2 pointer-events-none">
            <BuoyLayerNotice locale={locale} scope="home" overlay />
          </div>

          <MapControls
            isFullscreen={isFullscreen}
            isHeroEmbed={isHeroEmbed}
            clusterEnabled={clusterEnabled}
            showWindOnMarkers={showWindOnMarkers}
            windEnabled={windEnabled}
            radarEnabled={radarEnabled}
            radarPrefSet={radarPrefSet}
            radarUnavailable={radarUnavailable}
            isobathsEnabled={isobathsEnabled}
            onlyOnEnabled={onlyOnEnabled}
            coastalWarningsEnabled={coastalWarningsEnabled}
            clusterLabel={clusterLabel}
            windLabel={windLabel}
            windHint={windHint}
            radarLabel={radarLabel}
            radarHint={radarHint}
            radarResetLabel={t.map.radarReset}
            onlyOnLabel={onlyOnLabel}
            onlyOnHint={onlyOnHint}
            windLegendHelpLabel={windLegendHelpLabel}
            coastalWarningsLabel={coastalWarningsLabel}
            enterFullscreen={enterFullscreen}
            toggleCluster={toggleCluster}
            toggleWind={toggleWind}
            openWindLegend={openWindLegend}
            toggleRadar={toggleRadar}
            handleResetRadar={handleResetRadar}
            toggleIsobaths={toggleIsobaths}
            toggleOnlyOn={toggleOnlyOn}
            toggleCoastalWarnings={toggleCoastalWarnings}
            windButtonRef={windButtonRef}
            fullscreenBtnRef={fullscreenBtnRef}
          />

          {!isFullscreen && !isHeroEmbed && (
            <MapLayerToggle current={basemapMode} onChange={handleBasemapChangeLocal} isPt={isPt} />
          )}

          {!isHeroEmbed && (
            <MapLegend locale={locale} reserveHudSpace={isFullscreen} hudCompact={isFullscreen && hudCollapsed} isobathsTitle={t.map.isobathsLegend} isobathsVisible={isobathsEnabled && isobathsData != null} />
          )}

          {!isFullscreen && !isHeroEmbed && (
            <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
              {t.map.mapDataHint}
            </p>
          )}

          {isHeroEmbed && (
            <>
              <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 pointer-events-auto">
                <button type="button" onClick={toggleRadar} aria-label={radarLabel} aria-pressed={radarEnabled} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
                  <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
                  <span className="hidden sm:inline">{radarLabel}</span>
                </button>
                {(radarPrefSet || radarEnabled) && (
                  <button type="button" onClick={handleResetRadar} aria-label={t.map.radarReset} title={t.map.radarReset} className="inline-flex items-center justify-center w-8 h-8 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <button type="button" onClick={toggleIsobaths} aria-label={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths} title={t.map.isobathsHint} aria-pressed={isobathsEnabled} className="absolute top-[54px] right-3 z-[1000] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors pointer-events-auto">
                <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
                <span className="hidden sm:inline">{isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}</span>
              </button>
            </>
          )}

          {radarEnabled && radarData && (
            <RadarCarousel
              className={isHeroEmbed ? 'absolute bottom-20 right-3 z-[1000] pointer-events-auto' : isFullscreen ? 'absolute left-2 z-[1000]' : 'absolute bottom-8 left-2 sm:left-auto sm:right-2 z-[1000] max-w-[min(100%,320px)] sm:max-w-none'}
              style={isFullscreen ? { bottom: Math.max(radarLift + 12, 32) } : undefined}
              frames={radarFrameList}
              frameIndex={radarFrameIndex}
              onFrameChange={handleRadarFrameChange}
              mapBusyCount={radarBusySources.size}
              userPaused={radarUserPaused}
              onUserPausedChange={handleRadarUserPausedChange}
              labels={{ badge: t.map.radarBadge, hint: t.map.radarHint, scrub: t.map.radarScrub, play: t.map.radarPlay, pause: t.map.radarPause, paused: t.map.radarPaused, ipmaAttribution: radarAttributionLabel, gap: t.map.radarGap }}
              fullscreenHref={isFullscreen ? undefined : `/${locale}/mapa/?radar=1`}
              fullscreenLabel={t.map.radarFullscreen}
              onFullscreenOpen={handleRadarImmersionOpen}
            />
          )}

          {mapHud && isFullscreen && (
            <MapExploreHud
              {...mapHud}
              spotCount={hudSpotCount}
              visible
              isPt={isPt}
              basemapMode={basemapMode}
              onBasemapChange={handleBasemapChangeLocal}
              clusterEnabled={clusterEnabled}
              onToggleCluster={toggleCluster}
              radarEnabled={radarEnabled}
              onToggleRadar={toggleRadar}
              radarLabel={radarLabel}
              radarHint={radarHint}
              radarResetVisible={radarPrefSet || radarEnabled}
              onResetRadar={handleResetRadar}
              radarResetLabel={t.map.radarReset}
              isobathsEnabled={isobathsEnabled}
              onToggleIsobaths={toggleIsobaths}
              isobathsLabel={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
              isobathsHint={t.map.isobathsHint}
              coastalWarningsEnabled={coastalWarningsEnabled}
              onToggleCoastalWarnings={toggleCoastalWarnings}
              coastalWarningsLabel={coastalWarningsLabel}
              coastalWarningsHint={t.map.coastalWarningsHint}
              windEnabled={windEnabled}
              showWindOnMarkers={showWindOnMarkers}
              onToggleWind={toggleWind}
              onlyOnEnabled={onlyOnEnabled}
              onToggleOnlyOn={toggleOnlyOn}
              onlyOnLabel={onlyOnLabel}
              onlyOnHint={onlyOnHint}
              onExitFullscreen={exitFullscreen}
              windHint={windHint}
              exploreModeLabel={t.map.exploreMode}
              layerMapLabel={t.map.layerMap}
              layerSatelliteLabel={t.map.layerSatellite}
              clusterLabel={clusterLabel}
              windLabel={windLabel}
              exitLabel={exitFullscreenLabel}
              windLegendHelpLabel={windLegendHelpLabel}
              onOpenWindLegend={openWindLegend}
              windButtonRef={windButtonRef}
              collapseHudLabel={t.map.collapseHud}
              expandHudLabel={t.map.expandHud}
              onCollapsedChange={setHudCollapsed}
              buoyChip={<BuoyLayerChip locale={locale} />}
            />
          )}

          <WindRingLegend open={windLegendOpen} onClose={closeWindLegend} anchorRef={windButtonRef} locale={locale} />

          {isMobile && (
            <MapSpotSheet data={sheetSpot} selectedSport={selectedSport} locale={locale} onClose={() => setSheetSpot(null)} onViewSpot={onSpotSelect} />
          )}
        </>
      )}
    </div>
  );
}
