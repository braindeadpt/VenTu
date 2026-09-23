'use client';

import { useEffect, useRef, useState, useCallback, useMemo, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { unlockPageInteraction } from '@/lib/mapFullscreen';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapFullscreenHudProps } from './mapHudTypes';
import type { MapSpotSheetData } from './MapSpotSheet';
import type { BasemapMode } from './MapLayerToggle';
import {
  SPOT_REGION_ZOOM,
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
} from '@/lib/map-constants';
import type { MapSpotData } from './mapSpotData';
import {
  readClusterPref,
  readWindPref,
  readOnlyOnPref,
} from './mapHudPrefs';
import { exploreViewBoundsFromSpots } from './mapMarkers';

// ─── Orquestrador + compartimentos (docs/design/MAP-ZONES.md) ───
import { useMapCore } from './map/hooks/useMapCore';
import { MapUiProvider, type MapUiActions, type MapUiData } from './map/MapUiContext';
import {
  useMapLayersBase,
  useMapLayersFields,
  MapLayersZone,
} from './map/zones/MapLayersZone';
import {
  useMapChromeZone,
  MapChromeZone,
} from './map/zones/MapChromeZone';
import {
  useMapExploreZone,
  MapExploreZone,
} from './map/zones/MapExploreZone';
import {
  useMapMarkersZone,
  MapMarkersZone,
} from './map/zones/MapMarkersZone';
import {
  scoreAtHour,
} from '@/lib/mapHours';
import { MAP_ON_THRESHOLD, spotMatchesSportFilter, spotMeetsOnFilter } from '@/lib/gridSpotFilters';
import MapControls from './map/components/MapControls';

type SpotData = MapSpotData;

type MapHudProps = Omit<MapFullscreenHudProps, 'isPt' | 'visible'>;

interface SpotMapInteractiveProps {
  spotsData: SpotData[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  onSpotSelect?: (spotId: string) => void;
  /**
   * Fired once when the Leaflet map is initialized (container + controls)
   * — the signal hosts use to swap a loading poster for the interactive map
   * (homepage hero). Optional; hosts without a poster ignore it.
   */
  onReady?: () => void;
  mapHud?: MapHudProps;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  embedMode?: 'default' | 'hero';
  initialFullscreen?: boolean;
  initialRadarEnabled?: boolean;
  initialIsobathsEnabled?: boolean;
  initialHoursEnabled?: boolean;
  initialHourOfDay?: number | null;
  initialBuoysEnabled?: boolean;
  initialHsEnabled?: boolean;
  initialSstEnabled?: boolean;
  initialCurrentsEnabled?: boolean;
  focusSpotId?: string;
  initialCenter?: [number, number] | undefined;
  initialZoom?: number;
  fullscreenBelowHeader?: boolean;
  onExitFullscreen?: () => void;
}

export default function SpotMapInteractive({
  spotsData,
  selectedSport,
  selectedRegion,
  locale,
  onSpotSelect,
  onReady,
  mapHud,
  onFullscreenChange,
  embedMode = 'default',
  initialFullscreen = false,
  initialRadarEnabled = false,
  initialIsobathsEnabled = false,
  initialHoursEnabled = false,
  initialHourOfDay = null,
  initialBuoysEnabled = false,
  initialHsEnabled = false,
  initialSstEnabled = false,
  initialCurrentsEnabled = false,
  focusSpotId,
  initialCenter,
  initialZoom,
  fullscreenBelowHeader = false,
  onExitFullscreen: onExitFullscreenOverride,
}: SpotMapInteractiveProps) {
  const isHeroEmbed = embedMode === 'hero';
  const mapRef = useRef<HTMLDivElement>(null);
  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  const windButtonRef = useRef<HTMLButtonElement>(null);
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
  // Ref lida pelo iconCreateFunction dos clusters (criado uma vez no init) —
  // espelha o estado do toggle de vento; o efeito abaixo mantém-na em sync.
  const core = useMapCore({
    containerRef: mapRef,
    isHeroEmbed,
    locale,
    // Bounds da vista «Explorar» conhecidos logo ao montar (spots estáticos +
    // prefs lidas do localStorage) — o mapa nasce enquadrado, sem pedir tiles
    // do zoom default. Deep links com initialCenter enquadram o seu próprio
    // setView, por isso ficam sem bounds aqui.
    initialViewBounds: isHeroEmbed || initialCenter
      ? null
      : exploreViewBoundsFromSpots(
          readOnlyOnPref()
            ? spotsData.filter((d) => spotMeetsOnFilter(d, selectedSport))
            : spotsData,
          selectedRegion,
        ),
    // O painel nasce aberto (panelCollapsed=false) — o fit inicial reserva-o.
    exploreChrome: { enabled: Boolean(mapHud) && initialFullscreen, panelCollapsed: false },
  });
  const {
    mapInstanceRef, LRef, isReady, clusterReady, basemapMode, isMobile,
    tileState, retryBasemap,
    handleBasemapChange, clusterGroupRef, markersGroupRef,
    radarOverlayRef, isobathsLayerRef, coastalLayerRef, buoyLayerRef, markersCacheRef,
  } = core;

  // ── Ready signal (loading-poster swap) ──
  const onReadyRef = useRef(onReady);
  const readyFiredRef = useRef(false);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    if (isReady && !readyFiredRef.current) {
      readyFiredRef.current = true;
      onReadyRef.current?.();
    }
  }, [isReady]);

  // ── Estado partilhado (vive no orquestrador; exposto às zonas via
  //    MapUiContext — docs/design/MAP-ZONES.md) ──
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const [windEnabled, setWindEnabled] = useState(readWindPref);
  const [onlyOnEnabled, setOnlyOnEnabled] = useState(readOnlyOnPref);
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [sheetSpot, setSheetSpot] = useState<MapSpotSheetData | null>(null);

  // ── Zona de camadas: estado base (radar, 48 h, boias, isóbatas, …) ──
  const layersBase = useMapLayersBase({
    mapInstanceRef,
    LRef,
    radarOverlayRef,
    isobathsLayerRef,
    coastalLayerRef,
    buoyLayerRef,
    isReady,
    isPt,
    isFullscreen,
    isHeroEmbed,
    focusSpotId,
    initialRadarEnabled,
    initialIsobathsEnabled,
    initialHoursEnabled,
    initialHourOfDay,
    initialBuoysEnabled,
    t,
  });
  const {
    radarData, radarEnabled, radarFrameIndex, radarUserPaused, radarPrefSet,
    radarBusySources, radarLift,
    toggleRadar, handleRadarFrameChange, handleRadarUserPausedChange,
    handleResetRadar, handleRadarImmersionOpen,
    radarFrameList, radarLabel, radarHint, radarUnavailable, radarAttributionLabel,
    isobathsEnabled, isobathsData, toggleIsobaths,
    bathymetryEnabled, toggleBathymetry,
    seamarksEnabled, toggleSeamarks,
    coastalWarningsEnabled, toggleCoastalWarnings, coastalWarningsLabel,
    hoursFile, hoursOn, hoursLive, hoursFrame, hoursUserPaused, hoursPrefSet,
    hoursUnavailable, hoursTimes, toggleHours, handleHoursFrameChange,
    handleHoursUserPausedChange, handleResetHours,
    buoysEnabled, toggleBuoys,
    attributionHtml,
  } = layersBase;

  // Arcos por pin sempre que o marcador individual está visível — mesmo com
  // cluster ligado (os pins dentro de clusters nem chegam ao mapa; ao
  // desagrupar já nascem com o anel — o vento nunca «desaparece» a meio do zoom).
  const showWindOnMarkers = windEnabled && !isHeroEmbed;
  const activeCluster = isHeroEmbed ? true : clusterEnabled;

  // Deep links ?radar=1 / ?isobaths=1 handled by useMapLayers initial state —
  // sem efeitos de mount nem toque na preferência persistida (que só se grava
  // ao desligar ou ao toggle manual). Um efeito aqui seria uma corrida com o
  // mount do mapa (chunk dinâmico) e poderia nunca correr ou togglar duas vezes.

  // ── Fullscreen ──
  const router = useRouter();
  const enterFullscreen = useCallback(() => {
    if (!mapHud) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.push(`/${locale}/mapa/${search}`);
      return;
    }
    prevFocusRef.current = document.activeElement;
    setIsFullscreen(true);
  }, [mapHud, locale, router]);
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
  // ── Toggle handlers ──
  const toggleCluster = useCallback(() => {
    setClusterEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_CLUSTER_LS_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);
  const toggleWind = useCallback(() => {
    // Independente do cluster: ligado nos pins (desagrupado) ou como seta
    // média da zona na orla dos clusters — nunca explode a vista.
    setWindEnabled((prev) => {
      const next = !prev;
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

  // ── Initial center deep link ──
  const initialCenterDoneRef = useRef(false);
  useEffect(() => {
    if (!initialCenter || initialCenterDoneRef.current || !isReady) return;
    if (!mapInstanceRef.current) return;
    initialCenterDoneRef.current = true;
    mapInstanceRef.current.setView(initialCenter, initialZoom ?? SPOT_REGION_ZOOM, { animate: false });
    // Mark centering complete so tests can wait for it instead of racing
    // the map init (which exposes __RADAR_MAP__ before setView runs).
    if (typeof window !== 'undefined' && (window as any).__RADAR_TEST__) {
      (window as any).__RADAR_CENTERED__ = true;
    }
  }, [initialCenter, initialZoom, isReady, mapInstanceRef]);

  // ── Visible spots (derivação partilhada: marcadores, lista, campos) ──
  const hourScores = useMemo(() => {
    if (!hoursLive || !hoursFile) return null;
    const map = new Map<string, number>();
    for (const d of spotsData) {
      const n = scoreAtHour(hoursFile, d.spot.id, selectedSport, hoursFrame);
      if (n != null) map.set(d.spot.id, n);
    }
    return map;
  }, [hoursLive, hoursFile, selectedSport, hoursFrame, spotsData]);

  const visibleSpots = useMemo(() => {
    if (!onlyOnEnabled) return spotsData;
    if (hourScores) {
      return spotsData.filter((d) => {
        if (!spotMatchesSportFilter(d, selectedSport)) return false;
        if (selectedSport === 'big-wave' && d.spot.type !== 'big-wave') return false;
        const hour = hourScores.get(d.spot.id);
        if (hour == null) return spotMeetsOnFilter(d, selectedSport);
        return hour >= MAP_ON_THRESHOLD;
      });
    }
    return spotsData.filter((d) => spotMeetsOnFilter(d, selectedSport));
  }, [spotsData, onlyOnEnabled, selectedSport, hourScores]);

  const hsSpots = useMemo(
    () =>
      visibleSpots.map((d) => ({
        id: d.spot.id,
        lat: d.spot.lat,
        lon: d.spot.lon,
        type: d.spot.type,
        bestSwell: d.spot.bestSwell,
      })),
    [visibleSpots],
  );

  // ── Zona de camadas: campos interpolados + itens do menu + legenda ──
  const fields = useMapLayersFields({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialHsEnabled,
    initialSstEnabled,
    initialCurrentsEnabled,
    base: layersBase,
    hsSpots,
    windEnabled,
    t,
  });
  const {
    hsEnabled, hsUnavailable, toggleHs,
    sstEnabled, sstUnavailable, toggleSst,
    currentsEnabled, currentsUnavailable, toggleCurrents,
    layerCopy, sheetLayers, legendLayerProps,
  } = fields;

  // ── Zona de cromo: localizar/partilhar, legenda de vento, trilho temporal ──
  const chrome = useMapChromeZone({
    mapInstanceRef,
    observeRef: mapRef,
    isReady,
    locale,
    isPt,
    selectedSport,
    selectedRegion,
    windEnabled,
    radarEnabled,
    radarFrameList,
    radarFrameIndex,
    radarBusySources,
    radarUserPaused,
    hoursOn,
    hoursLive,
    hoursTimes,
    hoursFrame,
    hoursUserPaused,
    hoursFile,
    isobathsEnabled,
    buoysEnabled,
    hsEnabled,
    sstEnabled,
    currentsEnabled,
    handleHoursFrameChange,
    handleHoursUserPausedChange,
    handleRadarFrameChange,
    handleRadarUserPausedChange,
    t,
  });
  const {
    locate, locating, handleShareView,
    windLegendOpen, openWindLegend, closeWindLegend,
    windLegendHintVisible, onMarkerInteract,
    radarScrubbing, timeTrackNode,
    exitFullscreenLabel, windLabel, windHint, windLegendHelpLabel,
  } = chrome;

  // ── Zona explorar: sheet/painel, lista do viewport, extras ──
  const explore = useMapExploreZone({
    mapInstanceRef,
    isReady,
    isFullscreen,
    mapHud,
    visibleSpots,
    hourScores,
    selectedSport,
    isPt,
    locale,
    focusSpotId,
    initialHoursEnabled,
    initialRadarEnabled,
    onlyOnEnabled,
    clusterEnabled,
    toggleCluster,
    windEnabled,
    toggleWind,
    openWindLegend,
    t,
  });
  const {
    exploreSheetState, setExploreSheetState,
    panelCollapsed, setPanelCollapsed,
    openHeight, viewRows, sheetExtras,
    clusterLabel, onlyOnLabel, onlyOnHint, hudSpotCount,
  } = explore;

  // ── Zona de marcadores: pins, clusters, foco, sheet de detalhe ──
  const markers = useMapMarkersZone({
    mapInstanceRef,
    LRef,
    mapRef,
    clusterGroupRef,
    markersGroupRef,
    markersCacheRef,
    onSpotSelectRef,
    visibleSpots,
    onlyOnEnabled,
    selectedSport,
    selectedRegion,
    isReady,
    clusterReady,
    isMobile,
    isHeroEmbed,
    isFullscreen,
    activeCluster,
    showWindOnMarkers,
    locale,
    isPt,
    hourScores,
    onSpotSelect,
    onMarkerInteract,
    setSheetSpot,
    mapHud,
    panelCollapsed,
  });
  const { focusMapSpot } = markers;

  // Deep link ?spot= — a lista (sheet aberto no mobile / painel no desktop)
  // ganha a linha focada e o mapa enquadra o spot. Sem popup/sheet de
  // detalhe: o utilizador fica no contexto da lista.
  const deepLinkFocusRef = useRef(false);
  useEffect(() => {
    if (!focusSpotId || deepLinkFocusRef.current || !isReady || !isFullscreen || !mapHud) return;
    const d = visibleSpots.find((x) => x.spot.id === focusSpotId);
    const map = mapInstanceRef.current;
    if (!d || !map) return;
    deepLinkFocusRef.current = true;
    if (isMobile) setExploreSheetState('open');
    focusMapSpot(focusSpotId, false);
  }, [focusSpotId, isReady, isFullscreen, mapHud, isMobile, visibleSpots, mapInstanceRef, focusMapSpot, setExploreSheetState]);

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

  // ── Contexto partilhado (zonas consomem dados/acções via useMapUi*) ──
  const selectSpot = useCallback((spotId: string) => {
    onSpotSelectRef.current?.(spotId);
  }, []);
  const closeSpotSheet = useCallback(() => setSheetSpot(null), []);
  const uiData = useMemo<MapUiData>(() => ({
    sport: selectedSport,
    region: selectedRegion,
    locale,
    isPt,
    isReady,
    clusterReady,
    isMobile,
    isFullscreen,
    isHeroEmbed,
    hoursLive,
    hoursTimes,
    hoursFrame,
    hourScores,
    visibleSpots,
    focusSpotId,
    sheetSpot,
  }), [
    selectedSport, selectedRegion, locale, isPt,
    isReady, clusterReady, isMobile, isFullscreen, isHeroEmbed,
    hoursLive, hoursTimes, hoursFrame, hourScores, visibleSpots,
    focusSpotId, sheetSpot,
  ]);
  const uiActions = useMemo<MapUiActions>(() => ({
    selectSpot,
    focusSpot: focusMapSpot,
    openSpotSheet: setSheetSpot,
    closeSpotSheet,
    setHoursFrame: handleHoursFrameChange,
    toggleCluster,
    toggleWind,
    toggleOnlyOn,
  }), [
    selectSpot, focusMapSpot, closeSpotSheet, handleHoursFrameChange,
    toggleCluster, toggleWind, toggleOnlyOn,
  ]);

  const controls: ComponentProps<typeof MapControls> = {
    isFullscreen,
    isMobile,
    isHeroEmbed,
    clusterEnabled,
    windEnabled,
    radarEnabled,
    radarPrefSet,
    radarUnavailable,
    isobathsEnabled,
    onlyOnEnabled,
    coastalWarningsEnabled,
    fullscreenLabel: t.hero.exploreMap,
    clusterLabel,
    windLabel,
    windHint,
    radarLabel,
    radarHint,
    radarResetLabel: layerCopy.radarResetLabel,
    hoursEnabled: hoursOn,
    hoursUnavailable,
    hoursPrefSet,
    hoursLabel: layerCopy.hoursLabel,
    hoursHint: layerCopy.hoursHint,
    hoursResetLabel: layerCopy.hoursResetLabel,
    buoysEnabled,
    buoysLabel: layerCopy.buoysLabel,
    buoysHint: layerCopy.buoysHint,
    hsEnabled,
    hsUnavailable,
    hsLabel: layerCopy.hsLabel,
    hsHint: layerCopy.hsHint,
    sstEnabled,
    sstUnavailable,
    sstLabel: layerCopy.sstLabel,
    sstHint: layerCopy.sstHint,
    currentsEnabled,
    currentsUnavailable,
    currentsLabel: layerCopy.currentsLabel,
    currentsHint: layerCopy.currentsHint,
    isobathsLabel: layerCopy.isobathsLabel,
    bathymetryEnabled,
    bathymetryLabel: layerCopy.bathymetryLabel,
    bathymetryHint: layerCopy.bathymetryHint,
    seamarksEnabled,
    seamarksLabel: layerCopy.seamarksLabel,
    seamarksHint: layerCopy.seamarksHint,
    onlyOnLabel,
    onlyOnHint,
    windLegendHelpLabel,
    coastalWarningsLabel,
    layersLabel: layerCopy.layersMenuLabel,
    enterFullscreen,
    exitFullscreen,
    exitLabel: exitFullscreenLabel,
    toggleCluster,
    toggleWind,
    openWindLegend,
    toggleRadar,
    handleResetRadar,
    toggleHours,
    handleResetHours,
    toggleBuoys,
    toggleHs,
    toggleSst,
    toggleCurrents,
    toggleIsobaths,
    toggleBathymetry,
    toggleSeamarks,
    toggleOnlyOn,
    toggleCoastalWarnings,
    windButtonRef,
    fullscreenBtnRef,
  };

  return (
    <MapUiProvider data={uiData} actions={uiActions}>
      <div
        className={
          isFullscreen
            ? fullscreenBelowHeader
              ? 'fixed left-0 right-0 bottom-0 z-[1050] w-full overflow-visible bg-surface-1/[0.04] top-16'
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
              : { height: 'clamp(480px, 68vh, 720px)' }
        }
        data-map-fullscreen={isFullscreen ? 'true' : 'false'}
        data-map-hud={isFullscreen && mapHud ? 'visible' : 'hidden'}
        data-map-cluster={clusterEnabled ? 'true' : 'false'}
        data-map-wind={windEnabled ? 'true' : 'false'}
        data-map-only-on={onlyOnEnabled ? 'true' : 'false'}
        data-map-hours={hoursLive ? 'true' : 'false'}
        data-map-buoys={buoysEnabled ? 'true' : 'false'}
        data-map-hs={hsEnabled ? 'true' : 'false'}
        data-map-sst={sstEnabled ? 'true' : 'false'}
        data-map-currents={currentsEnabled ? 'true' : 'false'}
        data-map-bathymetry={bathymetryEnabled ? 'true' : 'false'}
        data-map-seamarks={seamarksEnabled ? 'true' : 'false'}
        data-map-hero-teaser={isHeroEmbed ? 'true' : undefined}
      >
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
              <span className="text-sm text-fg-muted">{t.mapUiLayers.loading}</span>
            </div>
          </div>
        )}
        {/* Trap Leaflet panes (z 200–700) so HUD / MapControls paint above tiles. */}
        <div className="absolute inset-0 z-0">
          <div
            ref={mapRef}
            role="region"
            className="w-full h-full"
            aria-label={isPt ? 'Mapa dos spots' : 'Spots map'}
          />
        </div>

        {isReady && (
          <>
            <MapChromeZone
              t={t}
              locale={locale}
              isFullscreen={isFullscreen}
              isMobile={isMobile}
              isHeroEmbed={isHeroEmbed}
              controls={controls}
              locateLabel={t.mapUiChrome.locateMe}
              shareLabel={t.mapUiChrome.shareView}
              isobathsEnabled={isobathsEnabled}
              isobathsData={isobathsData}
              radarLift={radarLift}
              legendLayerProps={legendLayerProps}
              state={chrome}
              windButtonRef={windButtonRef}
            />

            <MapLayersZone
              t={t}
              locale={locale}
              isPt={isPt}
              isFullscreen={isFullscreen}
              isHeroEmbed={isHeroEmbed}
              isMobile={isMobile}
              tileState={tileState}
              retryBasemap={retryBasemap}
              refreshLabel={t.common.refresh}
              basemapMode={basemapMode}
              onBasemapChange={handleBasemapChangeLocal}
              radarLabel={radarLabel}
              radarEnabled={radarEnabled}
              radarPrefSet={radarPrefSet}
              radarResetLabel={layerCopy.radarResetLabel}
              toggleRadar={toggleRadar}
              handleResetRadar={handleResetRadar}
              isobathsEnabled={isobathsEnabled}
              isobathsLabel={layerCopy.isobathsLabel}
              isobathsHint={layerCopy.isobathsHint}
              toggleIsobaths={toggleIsobaths}
              radarData={radarData}
              radarFrameList={radarFrameList}
              radarFrameIndex={radarFrameIndex}
              radarBusyCount={radarBusySources.size}
              radarUserPaused={radarUserPaused}
              radarLift={radarLift}
              radarAttributionLabel={radarAttributionLabel}
              radarScrubbing={radarScrubbing}
              hoursOn={hoursOn}
              panelCollapsed={panelCollapsed}
              handleRadarFrameChange={handleRadarFrameChange}
              handleRadarUserPausedChange={handleRadarUserPausedChange}
              handleRadarImmersionOpen={handleRadarImmersionOpen}
            />

            <MapExploreZone
              mapHud={mapHud}
              isFullscreen={isFullscreen}
              isMobile={isMobile}
              state={explore}
              sheetLayers={sheetLayers}
              legendLayerProps={legendLayerProps}
              basemapMode={basemapMode}
              onBasemapChange={handleBasemapChangeLocal}
              exitFullscreenLabel={exitFullscreenLabel}
              onExitFullscreen={exitFullscreen}
              onlyOnEnabled={onlyOnEnabled}
              onToggleOnlyOn={toggleOnlyOn}
              timeTrack={timeTrackNode}
              attributionHtml={attributionHtml}
            />

            <MapMarkersZone />
          </>
        )}
      </div>
    </MapUiProvider>
  );
}
