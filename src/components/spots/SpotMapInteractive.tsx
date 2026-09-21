'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CloudRain, RotateCcw, Waves } from 'lucide-react';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { unlockPageInteraction } from '@/lib/mapFullscreen';
import type { GridSportFilter } from '@/lib/sportRatings';
import MapExploreHud, { type MapExploreHudProps } from './MapExploreHud';
import BuoyLayerChip from './BuoyLayerChip';
import MapSpotSheet, { type MapSpotSheetData } from './MapSpotSheet';
import MapLegend from './MapLegend';
import MapLayerToggle from './MapLayerToggle';
import WindRingLegend from './WindRingLegend';
import type { BasemapMode } from './MapLayerToggle';
import {
  OPEN_METEO_ATTRIBUTION,
  SPOT_REGION_ZOOM,
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
} from '@/lib/map-constants';
import { openMeteoAttributionHtml } from '@/lib/openMeteoAttribution';
import { hasSeenWindRingLegend, markWindRingLegendSeen } from '@/lib/windRingLegend';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { strongestSpotWarning, warningBadgeLabel } from '@/lib/ipmaWarnings';
import { radarFrameClock } from '@/lib/ipmaRadar';
import MapTimeTrack from './map/MapTimeTrack';
import MapTideChip from './map/MapTideChip';
import { SEA_STATE_WARNING_TYPES } from '@/lib/ipmaWarnings';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import RadarCarousel from './RadarCarousel';
import type { MapSpotData } from './mapSpotData';
import { includeSpotInViewportBounds } from './mapViewportBounds';
import {
  readClusterPref,
  readWindPref,
  readOnlyOnPref,
} from './mapHudPrefs';
import { exploreViewBoundsFromSpots } from './mapMarkers';

// ─── Imports for hooks and sub-components ───
import { useMapCore } from './map/hooks/useMapCore';
import { useMapLayers } from './map/hooks/useMapLayers';
import { useMapMarkers } from './map/hooks/useMapMarkers';
import { useMapHours } from './map/hooks/useMapHours';
import { useMapBuoyDots } from './map/hooks/useMapBuoyDots';
import { useMapHsField } from './map/hooks/useMapHsField';
import { useMapCurrentsField } from './map/hooks/useMapCurrentsField';
import { useMapWindField } from './map/hooks/useMapWindField';
import { useMapSstField } from './map/hooks/useMapSstField';
import MapControls from './map/components/MapControls';
import MapThermalChip from './map/MapThermalChip';
import { useMapTimeTrack } from './map/useMapTimeTrack';
import {
  MAP_HOURS_TICK_MS,
  mapHoursClock,
  scoreAtHour,
} from '@/lib/mapHours';
import { mapTideChipAt, pickMapTideCurve } from '@/lib/mapTideChip';
import { thermalHudAt } from '@/lib/mapThermal';
import { MAP_ON_THRESHOLD, spotMatchesSportFilter, spotMeetsOnFilter } from '@/lib/gridSpotFilters';

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
  | 'hoursEnabled'
  | 'onToggleHours'
  | 'hoursLabel'
  | 'hoursHint'
  | 'buoysEnabled'
  | 'onToggleBuoys'
  | 'buoysLabel'
  | 'buoysHint'
  | 'hsEnabled'
  | 'onToggleHs'
  | 'hsLabel'
  | 'hsHint'
  | 'sstEnabled'
  | 'onToggleSst'
  | 'sstLabel'
  | 'sstHint'
  | 'currentsEnabled'
  | 'onToggleCurrents'
  | 'currentsLabel'
  | 'currentsHint'
  | 'isobathsEnabled'
  | 'onToggleIsobaths'
  | 'isobathsLabel'
  | 'isobathsHint'
  | 'bathymetryEnabled'
  | 'onToggleBathymetry'
  | 'bathymetryLabel'
  | 'bathymetryHint'
  | 'seamarksEnabled'
  | 'onToggleSeamarks'
  | 'seamarksLabel'
  | 'seamarksHint'
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

  // ── Toggle state ──
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const [windEnabled, setWindEnabled] = useState(readWindPref);
  const [onlyOnEnabled, setOnlyOnEnabled] = useState(readOnlyOnPref);
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [sheetSpot, setSheetSpot] = useState<MapSpotSheetData | null>(null);
  const [windLegendOpen, setWindLegendOpen] = useState(false);

  // Arcos por pin sempre que o marcador individual está visível — mesmo com
  // cluster ligado (os pins dentro de clusters nem chegam ao mapa; ao
  // desagrupar já nascem com o anel — o vento nunca «desaparece» a meio do zoom).
  const showWindOnMarkers = windEnabled && !isHeroEmbed;
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
    initialIsobathsEnabled,
    radarOverlayRef,
    isobathsLayerRef,
    coastalLayerRef,
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
  } = layers;

  const hours = useMapHours({
    isFullscreen,
    initialEnabled: initialHoursEnabled,
    initialHourOfDay,
  });
  const {
    hoursFile, hoursOn, hoursLive, hoursFrame, hoursUserPaused, hoursPrefSet,
    hoursUnavailable, hoursTimes, toggleHours, handleHoursFrameChange,
    handleHoursUserPausedChange, handleResetHours,
  } = hours;

  const { buoysEnabled, toggleBuoys } = useMapBuoyDots({
    mapInstanceRef,
    LRef,
    buoyLayerRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    initialEnabled: initialBuoysEnabled,
    labels: {
      hs: t.map.buoyHs,
      stale: t.map.buoyStale,
      sourceIh: t.map.buoySourceIh,
      sourceWmo: t.map.buoySourceWmo,
      noHs: t.map.buoyNoHs,
    },
  });

  const reducedMotion = usePrefersReducedMotion();
  const [radarScrubbing, setRadarScrubbing] = useState(false);
  const [hoursScrubbing, setHoursScrubbing] = useState(false);
  const radarHudPaused =
    radarScrubbing || radarBusySources.size > 0 || radarUserPaused || reducedMotion || hoursOn;
  const radarClock = radarFrameClock(radarFrameList[radarFrameIndex]?.frameTime ?? null) ?? '';
  const { paused: hoursHudPaused } = useMapTimeTrack({
    length: hoursLive ? hoursTimes.length : 0,
    index: hoursFrame,
    onIndexChange: handleHoursFrameChange,
    mapBusyCount: radarBusySources.size,
    userPaused: hoursUserPaused,
    externalScrubbing: hoursScrubbing,
    tickMs: MAP_HOURS_TICK_MS,
    observeRef: mapRef,
  });
  const hoursClock = hoursTimes[hoursFrame] ? mapHoursClock(hoursTimes[hoursFrame]) : '';
  const tideChip = useMemo(() => {
    const curve = pickMapTideCurve(hoursFile?.tides, selectedRegion);
    if (!curve) return undefined;
    const at = hoursLive && hoursTimes[hoursFrame]
      ? new Date(hoursTimes[hoursFrame])
      : new Date();
    const model = mapTideChipAt(curve, at, isPt ? 'pt' : 'en');
    if (!model) return undefined;
    const phaseLabel =
      model.phase === 'rising' ? t.map.tideChipRising
        : model.phase === 'falling' ? t.map.tideChipFalling
          : model.phase === 'high' ? t.map.tideChipHigh
            : t.map.tideChipLow;
    const kindLabel = model.nextKind === 'high'
      ? t.map.tideChipHigh
      : model.nextKind === 'low' ? t.map.tideChipLow
        : '';
    const ariaLabel = model.nextTime && kindLabel
      ? t.map.tideChipAriaNext
        .replace('{phase}', phaseLabel)
        .replace('{kind}', kindLabel)
        .replace('{time}', model.nextTime)
      : t.map.tideChipAria.replace('{phase}', phaseLabel);
    return (
      <MapTideChip
        phase={model.phase}
        phaseLabel={phaseLabel}
        nextTime={model.nextTime}
        ariaLabel={ariaLabel}
      />
    );
  }, [
    hoursFile,
    selectedRegion,
    hoursLive,
    hoursTimes,
    hoursFrame,
    isPt,
    t.map.tideChipRising,
    t.map.tideChipFalling,
    t.map.tideChipHigh,
    t.map.tideChipLow,
    t.map.tideChipAria,
    t.map.tideChipAriaNext,
  ]);

  const thermalChip = useMemo(() => {
    const summary = thermalHudAt(hoursFile, hoursLive ? hoursFrame : 0);
    if (!summary) return undefined;
    const kindLabel = summary.kind === 'sea' ? t.map.thermalSea : t.map.thermalLand;
    const ariaLabel = t.map.thermalChipAria
      .replace('{kind}', kindLabel)
      .replace('{count}', String(summary.count));
    return (
      <MapThermalChip
        kind={summary.kind}
        kindLabel={kindLabel}
        count={summary.count}
        ariaLabel={ariaLabel}
      />
    );
  }, [
    hoursFile,
    hoursLive,
    hoursFrame,
    t.map.thermalSea,
    t.map.thermalLand,
    t.map.thermalChipAria,
  ]);

  const timeTrackChips = tideChip || thermalChip ? (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {tideChip}
      {thermalChip}
    </span>
  ) : undefined;

  useEffect(() => {
    if (!radarEnabled) setRadarScrubbing(false);
  }, [radarEnabled]);
  useEffect(() => {
    if (!hoursOn) setHoursScrubbing(false);
  }, [hoursOn]);

  // Deep links ?radar=1 / ?isobaths=1 handled by useMapLayers initial state —
  // sem efeitos de mount nem toque na preferência persistida (que só se grava
  // ao desligar ou ao toggle manual). Um efeito aqui seria uma corrida com o
  // mount do mapa (chunk dinâmico) e poderia nunca correr ou togglar duas vezes.

  // O crédito do basemap e das camadas é gerido pelo próprio Leaflet: cada
  // layer regista `attribution` ao entrar no mapa e o AttributionControl faz
  // add/remove por contagem de referências (os efeitos IH em useMapLayers
  // usam add/removeAttribution; basemap/EMODnet/OpenSeaMap/radar vão na opção
  // `attribution` do layer). NÃO regravar `_attributions` aqui — a fotografia
  // antiga apagava os créditos EMODnet/OpenSeaMap/radar registados pelas
  // camadas e deixava o crédito OSM duplicado.
  // A única excepção é o crédito do Open-Meteo: o controlo nasce em useMapCore
  // com a cadeia canónica EN (que não conhece a tradução) e aqui troca-se pelo
  // lead-in localizado.
  const openMeteoCredit = openMeteoAttributionHtml(t.map.weatherCredit);
  useEffect(() => {
    if (!isReady) return;
    const ac = mapInstanceRef.current?.attributionControl;
    if (!ac || openMeteoCredit === OPEN_METEO_ATTRIBUTION) return;
    ac.removeAttribution(OPEN_METEO_ATTRIBUTION);
    ac.addAttribution(openMeteoCredit);
    return () => {
      ac.removeAttribution(openMeteoCredit);
      ac.addAttribution(OPEN_METEO_ATTRIBUTION);
    };
  }, [isReady, openMeteoCredit, mapInstanceRef]);

  // ── Warnings ──
  const warningsData = useIpmaWarnings();

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

  // ── Wind legend ──
  const openWindLegend = useCallback(() => { setWindLegendOpen(true); }, []);
  const closeWindLegend = useCallback(() => { setWindLegendOpen(false); }, []);

  // One-time inline teaching hint (non-modal, never blocks the map). Shows
  // once after the user's FIRST marker interaction, then never again
  // (persisted via the same localStorage flag the ? button honors).
  const [windLegendHintVisible, setWindLegendHintVisible] = useState(false);
  const windLegendHintQueuedRef = useRef(false);
  const onMarkerInteract = useCallback(() => {
    if (windLegendHintQueuedRef.current || hasSeenWindRingLegend()) return;
    windLegendHintQueuedRef.current = true;
    markWindRingLegendSeen();
    setWindLegendHintVisible(true);
  }, []);
  useEffect(() => {
    if (!windLegendHintVisible) return;
    const id = window.setTimeout(() => setWindLegendHintVisible(false), 12_000);
    return () => window.clearTimeout(id);
  }, [windLegendHintVisible]);

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
  const { hsEnabled, hsUnavailable, toggleHs: toggleHsRaw, disableHs } = useMapHsField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialEnabled: initialHsEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });
  const { sstEnabled, sstUnavailable, toggleSst: toggleSstRaw, disableSst } = useMapSstField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialEnabled: initialSstEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });
  const { currentsEnabled, currentsUnavailable, toggleCurrents } = useMapCurrentsField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialEnabled: initialCurrentsEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });
  useMapWindField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    enabled: windEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });

  useEffect(() => {
    if (sstEnabled && hsEnabled) disableHs();
  }, [sstEnabled, hsEnabled, disableHs]);

  const toggleHs = useCallback(() => {
    if (!hsEnabled && sstEnabled) disableSst();
    toggleHsRaw();
  }, [hsEnabled, sstEnabled, toggleHsRaw, disableSst]);

  const toggleSst = useCallback(() => {
    if (!sstEnabled && hsEnabled) disableHs();
    toggleSstRaw();
  }, [sstEnabled, hsEnabled, toggleSstRaw, disableHs]);

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
  const windHint = null;
  const onlyOnLabel = onlyOnEnabled ? t.map.onlyOnOff : t.map.onlyOn;
  const onlyOnHint = t.map.onlyOnHint;
  const hoursLabel = hoursOn ? t.map.hideHours : t.map.showHours;
  const hoursHint = t.map.hoursHint;
  const buoysLabel = buoysEnabled ? t.map.hideBuoys : t.map.showBuoys;
  const hsLabel = hsEnabled ? t.map.hideHs : t.map.showHs;
  const sstLabel = sstEnabled ? t.map.hideSst : t.map.showSst;
  const currentsLabel = currentsEnabled ? t.map.hideCurrents : t.map.showCurrents;
  const windLegendHelpLabel = t.map.windRingLegend.help;
  const hudSpotCount = onlyOnEnabled ? visibleSpots.length : (mapHud?.spotCount ?? visibleSpots.length);

  // ── Markers (extracted hook: cache, chunked insertion, cluster switching) ──
  const closePopupAndSheet = useCallback(() => {
    mapInstanceRef.current?.closePopup();
    setSheetSpot(null);
  }, [mapInstanceRef]);
  useMapMarkers({
    mapInstanceRef, LRef, clusterGroupRef, markersGroupRef, markersCacheRef,
    visibleSpots, onlyOnEnabled, selectedSport, selectedRegion, isReady, clusterReady,
    isMobile, isHeroEmbed, activeCluster, showWindOnMarkers, locale,
    warningsBySpot, hourScores, onSpotSelect, onMarkerInteract, setSheetSpot, closePopupAndSheet,
  });

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

  // Hero: o mapa é uma imagem viva sem navegação — um clique num cluster não
  // faz zoom (ficaria preso sem drag/controlo); leva ao /mapa/ onde tudo é
  // explorável. Marcadores individuais continuam a abrir popup/sheet.
  useEffect(() => {
    if (!isHeroEmbed || !clusterReady || !clusterGroupRef.current) return;
    const mcg = clusterGroupRef.current;
    const onClusterClick = () => router.push(`/${locale}/mapa/`);
    mcg.on('clusterclick', onClusterClick);
    return () => { mcg.off('clusterclick', onClusterClick); };
  }, [isHeroEmbed, clusterReady, clusterGroupRef, locale, router]);

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
            <span className="text-sm text-fg-muted">{t.map.loading}</span>
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
          {/* Auditoria 2026-09-16 (C4): o banner toast sobre o mapa saiu —
              chrome+toast cobriam ~55% do viewport mobile. O mesmo aviso vive
              agora só no chip compacto do HUD (BuoyLayerChip), ligado ao
              mesmo useBuoyLayerNotice. */}
          <MapControls
            isFullscreen={isFullscreen}
            isMobile={isMobile}
            isHeroEmbed={isHeroEmbed}
            clusterEnabled={clusterEnabled}
            windEnabled={windEnabled}
            radarEnabled={radarEnabled}
            radarPrefSet={radarPrefSet}
            radarUnavailable={radarUnavailable}
            isobathsEnabled={isobathsEnabled}
            onlyOnEnabled={onlyOnEnabled}
            coastalWarningsEnabled={coastalWarningsEnabled}
            fullscreenLabel={t.hero.exploreMap}
            clusterLabel={clusterLabel}
            windLabel={windLabel}
            windHint={windHint}
            radarLabel={radarLabel}
            radarHint={radarHint}
            radarResetLabel={t.map.radarReset}
            hoursEnabled={hoursOn}
            hoursUnavailable={hoursUnavailable}
            hoursPrefSet={hoursPrefSet}
            hoursLabel={hoursLabel}
            hoursHint={hoursHint}
            hoursResetLabel={t.map.hoursReset}
            buoysEnabled={buoysEnabled}
            buoysLabel={buoysLabel}
            buoysHint={t.map.buoysHint}
            hsEnabled={hsEnabled}
            hsUnavailable={hsUnavailable}
            hsLabel={hsLabel}
            hsHint={t.map.hsHint}
            sstEnabled={sstEnabled}
            sstUnavailable={sstUnavailable}
            sstLabel={sstLabel}
            sstHint={t.map.sstHint}
            currentsEnabled={currentsEnabled}
            currentsUnavailable={currentsUnavailable}
            currentsLabel={currentsLabel}
            currentsHint={t.map.currentsHint}
            isobathsLabel={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
            bathymetryEnabled={bathymetryEnabled}
            bathymetryLabel={bathymetryEnabled ? t.map.hideBathymetry : t.map.showBathymetry}
            bathymetryHint={t.map.bathymetryHint}
            seamarksEnabled={seamarksEnabled}
            seamarksLabel={seamarksEnabled ? t.map.hideSeamarks : t.map.showSeamarks}
            seamarksHint={t.map.seamarksHint}
            onlyOnLabel={onlyOnLabel}
            onlyOnHint={onlyOnHint}
            windLegendHelpLabel={windLegendHelpLabel}
            coastalWarningsLabel={coastalWarningsLabel}
            layersLabel={t.map.layersMenu}
            enterFullscreen={enterFullscreen}
            exitFullscreen={exitFullscreen}
            exitLabel={exitFullscreenLabel}
            toggleCluster={toggleCluster}
            toggleWind={toggleWind}
            openWindLegend={openWindLegend}
            toggleRadar={toggleRadar}
            handleResetRadar={handleResetRadar}
            toggleHours={toggleHours}
            handleResetHours={handleResetHours}
            toggleBuoys={toggleBuoys}
            toggleHs={toggleHs}
            toggleSst={toggleSst}
            toggleCurrents={toggleCurrents}
            toggleIsobaths={toggleIsobaths}
            toggleBathymetry={toggleBathymetry}
            toggleSeamarks={toggleSeamarks}
            toggleOnlyOn={toggleOnlyOn}
            toggleCoastalWarnings={toggleCoastalWarnings}
            windButtonRef={windButtonRef}
            fullscreenBtnRef={fullscreenBtnRef}
          />

          {windLegendHintVisible && (
            <div
              role="note"
              aria-label={t.map.windRingLegend.help}
              className="absolute z-[1150] bottom-32 left-3 right-3 sm:right-auto sm:w-[320px] rounded-card border border-divider bg-bg-elevated shadow-card px-4 py-3 motion-reduce:animate-none animate-fade-up"
            >
              <p className="text-body-sm font-semibold text-fg mb-1">{t.map.windRingLegend.title}</p>
              <p className="text-meta-sm text-fg-muted leading-snug">{t.map.windRingLegend.rule}</p>
              <button
                type="button"
                onClick={openWindLegend}
                className="mt-2 text-meta-sm font-semibold text-accent hover:underline underline-offset-2"
              >
                {t.map.windRingLegend.help}
              </button>
            </div>
          )}

          {tileState === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1002] flex items-center gap-2 rounded-full border border-divider bg-bg-elevated/90 backdrop-blur-sm px-3 py-1.5 shadow-card pointer-events-none"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin"
                aria-hidden
              />
              <span className="text-meta-sm text-fg-muted">{t.map.loading}</span>
            </div>
          )}

          {tileState === 'failed' && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[1002] flex justify-center px-4 pointer-events-none">
              <div
                role="alert"
                className="pointer-events-auto flex flex-col items-center gap-2.5 rounded-card border border-divider bg-bg-elevated shadow-card px-5 py-4 max-w-xs text-center"
              >
                <p className="text-meta-sm font-semibold text-fg">{t.map.mapUnavailable}</p>
                <button
                  type="button"
                  onClick={retryBasemap}
                  className="inline-flex items-center gap-1.5 rounded-input border border-divider bg-surface-1/[0.06] px-3 py-1.5 text-meta-sm font-semibold text-fg hover:bg-surface-1/[0.12] transition-colors duration-150 touch-manipulation"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                  {t.common.refresh}
                </button>
              </div>
            </div>
          )}

          {!isFullscreen && !isHeroEmbed && (
            <MapLayerToggle current={basemapMode} onChange={handleBasemapChangeLocal} isPt={isPt} />
          )}

          {(!isHeroEmbed || (isobathsEnabled && isobathsData != null)) && (
            <MapLegend
              locale={locale}
              reserveHudSpace={isFullscreen}
              hudLift={isFullscreen ? radarLift : 0}
              placement={isHeroEmbed ? 'hero' : 'map'}
              isobathsTitle={t.map.isobathsLegend}
              isobathsVisible={isobathsEnabled && isobathsData != null}
              hsTitle={t.map.hsLegend}
              hsVisible={hsEnabled}
              sstTitle={t.map.sstLegend}
              sstVisible={sstEnabled}
              currentsTitle={t.map.currentsLegend}
              currentsVisible={currentsEnabled}
              windTitle={t.map.windLegend}
              windVisible={isFullscreen && !isHeroEmbed && windEnabled}
              bathymetryTitle={t.map.bathymetryLegend}
              bathymetryVisible={bathymetryEnabled}
              bathymetryContoursLabel={t.map.bathymetryContours}
              seamarksTitle={t.map.seamarksLegend}
              seamarksVisible={seamarksEnabled}
              seamarksMarksLabel={t.map.seamarksLegendMarks}
              warningsTitle={t.map.coastalWarningsLegend}
              warningsVisible={isFullscreen && !isHeroEmbed && coastalWarningsEnabled}
              warningsZoneLabel={t.map.coastalWarningsLegendZone}
              warningsOrcaLabel={t.map.coastalWarningsLegendOrca}
            />
          )}

          {!isFullscreen && !isHeroEmbed && (
            <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
              {t.map.mapDataHint}
            </p>
          )}

          {isHeroEmbed && (
            <>
              <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 pointer-events-auto">
                <button type="button" onClick={toggleRadar} aria-label={radarLabel} aria-pressed={radarEnabled} className="inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
                  <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
                  <span className="hidden sm:inline">{radarLabel}</span>
                </button>
                {(radarPrefSet || radarEnabled) && (
                  <button type="button" onClick={handleResetRadar} aria-label={t.map.radarReset} title={t.map.radarReset} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center w-8 h-8 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <button type="button" onClick={toggleIsobaths} aria-label={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths} title={t.map.isobathsHint} aria-pressed={isobathsEnabled} className="absolute top-[70px] right-3 z-[1000] inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors pointer-events-auto">
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
              userPaused={radarUserPaused || hoursOn}
              onUserPausedChange={handleRadarUserPausedChange}
              labels={{ badge: t.map.radarBadge, hint: t.map.radarHint, scrub: t.map.radarScrub, play: t.map.radarPlay, pause: t.map.radarPause, paused: t.map.radarPaused, ipmaAttribution: radarAttributionLabel, gap: t.map.radarGap, stale: t.map.radarStale }}
              fullscreenHref={isFullscreen ? undefined : `/${locale}/mapa/?radar=1`}
              fullscreenLabel={t.map.radarFullscreen}
              onFullscreenOpen={handleRadarImmersionOpen}
              hideScrubber={isFullscreen}
              externalScrubbing={radarScrubbing}
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
              hoursEnabled={hoursOn}
              onToggleHours={toggleHours}
              hoursLabel={hoursLabel}
              hoursHint={hoursHint}
              hoursUnavailable={hoursUnavailable}
              hoursResetVisible={hoursPrefSet || hoursOn}
              onResetHours={handleResetHours}
              hoursResetLabel={t.map.hoursReset}
              hsEnabled={hsEnabled}
              onToggleHs={toggleHs}
              hsLabel={hsLabel}
              hsHint={t.map.hsHint}
              hsUnavailable={hsUnavailable}
              sstEnabled={sstEnabled}
              onToggleSst={toggleSst}
              sstLabel={sstLabel}
              sstHint={t.map.sstHint}
              sstUnavailable={sstUnavailable}
              currentsEnabled={currentsEnabled}
              onToggleCurrents={toggleCurrents}
              currentsLabel={currentsLabel}
              currentsHint={t.map.currentsHint}
              currentsUnavailable={currentsUnavailable}
              buoysEnabled={buoysEnabled}
              onToggleBuoys={toggleBuoys}
              buoysLabel={buoysLabel}
              buoysHint={t.map.buoysHint}
              isobathsEnabled={isobathsEnabled}
              onToggleIsobaths={toggleIsobaths}
              isobathsLabel={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
              isobathsHint={t.map.isobathsHint}
              bathymetryEnabled={bathymetryEnabled}
              onToggleBathymetry={toggleBathymetry}
              bathymetryLabel={bathymetryEnabled ? t.map.hideBathymetry : t.map.showBathymetry}
              bathymetryHint={t.map.bathymetryHint}
              seamarksEnabled={seamarksEnabled}
              onToggleSeamarks={toggleSeamarks}
              seamarksLabel={seamarksEnabled ? t.map.hideSeamarks : t.map.showSeamarks}
              seamarksHint={t.map.seamarksHint}
              coastalWarningsEnabled={coastalWarningsEnabled}
              onToggleCoastalWarnings={toggleCoastalWarnings}
              coastalWarningsLabel={coastalWarningsLabel}
              coastalWarningsHint={t.map.coastalWarningsHint}
              windEnabled={windEnabled}
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
              layersLabel={t.map.layersMenu}
              clusterLabel={clusterLabel}
              windLabel={windLabel}
              exitLabel={exitFullscreenLabel}
              windLegendHelpLabel={windLegendHelpLabel}
              onOpenWindLegend={openWindLegend}
              windButtonRef={windButtonRef}
              collapseHudLabel={t.map.collapseHud}
              expandHudLabel={t.map.expandHud}
              buoyChip={<BuoyLayerChip locale={locale} />}
              timeTrack={
                hoursLive ? (
                  <MapTimeTrack
                    variant="hud"
                    mode="hours"
                    length={hoursTimes.length}
                    index={hoursFrame}
                    onIndexChange={handleHoursFrameChange}
                    paused={hoursHudPaused}
                    userPaused={hoursUserPaused}
                    onUserPausedChange={handleHoursUserPausedChange}
                    onScrubbingChange={setHoursScrubbing}
                    clock={hoursClock}
                    tideChip={timeTrackChips}
                    labels={{
                      scrub: t.map.hoursScrub,
                      play: t.map.hoursPlay,
                      pause: t.map.hoursPause,
                    }}
                  />
                ) : radarEnabled && radarFrameList.length > 1 ? (
                  <MapTimeTrack
                    variant="hud"
                    mode="radar"
                    length={radarFrameList.length}
                    index={radarFrameIndex}
                    onIndexChange={handleRadarFrameChange}
                    paused={radarHudPaused}
                    userPaused={radarUserPaused}
                    onUserPausedChange={handleRadarUserPausedChange}
                    onScrubbingChange={setRadarScrubbing}
                    clock={radarClock}
                    tideChip={timeTrackChips}
                    labels={{
                      scrub: t.map.radarScrub,
                      play: t.map.radarPlay,
                      pause: t.map.radarPause,
                    }}
                  />
                ) : undefined
              }
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
