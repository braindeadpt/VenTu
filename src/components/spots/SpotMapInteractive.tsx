'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Layers, MapPin, Maximize2, Wind } from 'lucide-react';
import type L from 'leaflet';
import { getTranslation, validateLocale } from '@/lib/i18n';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { resolveWavePowerKw, MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';
import { renderSpotPopup } from './SpotPopupContent';
import MapExploreHud, { type MapExploreHudProps } from './MapExploreHud';
import MapSpotSheet, { type MapSpotSheetData } from './MapSpotSheet';
import MapLegend from './MapLegend';
import MapLayerToggle from './MapLayerToggle';
import type { BasemapMode } from './MapLayerToggle';
import { createClusterIconFunction } from './MapClusterIcon';
import {
  TILE_URLS,
  TILE_ATTRIBUTIONS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  CLUSTER_CONFIG,
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  getScoreRgb,
  SPORT_CSS_VARS,
} from '@/lib/map-constants';
import { buildMapWindArrowSvg } from '@/lib/mapWindArrow';
import { getDifficultyMarkerColor } from '@/lib/mapDifficulty';
import { getMacroRegion } from '@/lib/regions';
import { getSpotImage } from '@/lib/spotImage';
import { DEFAULT_REGION } from '@/lib/gridFilters';

const ISLAND_MACRO_REGIONS = new Set(['Açores', 'Madeira']);

/** Keep initial fitBounds on continental PT unless the user filters to islands. */
function includeSpotInViewportBounds(spot: Spot, selectedRegion: string): boolean {
  const macro = getMacroRegion(spot.region);
  if (selectedRegion === 'Açores' || selectedRegion === 'Madeira') {
    return macro === selectedRegion;
  }
  if (selectedRegion !== DEFAULT_REGION && selectedRegion !== 'Todos') {
    return macro === selectedRegion;
  }
  return !ISLAND_MACRO_REGIONS.has(macro);
}

// ─── Types ───
interface SpotData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

type MapHudProps = Omit<
  MapExploreHudProps,
  | 'isPt'
  | 'visible'
  | 'basemapMode'
  | 'onBasemapChange'
  | 'clusterEnabled'
  | 'onToggleCluster'
  | 'windEnabled'
  | 'showWindOnMarkers'
  | 'onToggleWind'
  | 'onExitFullscreen'
  | 'windHint'
  | 'exploreModeLabel'
  | 'layerMapLabel'
  | 'layerSatelliteLabel'
  | 'clusterLabel'
  | 'windLabel'
  | 'exitLabel'
>;

interface SpotMapInteractiveProps {
  spotsData: SpotData[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  onSpotSelect?: (spotId: string) => void;
  mapHud?: MapHudProps;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  /** Home hero: fill parent, hide corner controls (overlay has filters). */
  embedMode?: 'default' | 'hero';
  /** Start in explore/fullscreen mode (e.g. /mapa page). */
  initialFullscreen?: boolean;
  /** Fullscreen map below fixed header (top offset 4rem). */
  fullscreenBelowHeader?: boolean;
  /** Override exit fullscreen (e.g. navigate home). */
  onExitFullscreen?: () => void;
}

// ─── Helpers ───
function getBestScore(data: SpotData, sport: GridSportFilter): number {
  if (sport === 'all') {
    return Math.max(...Object.values(data.allScores).map((s) => s?.score || 0));
  }
  if (sport === 'big-wave') {
    return data.allScores.surf?.score || 0;
  }
  return data.allScores[sport]?.score || 0;
}

function getSpotRgb(spot: Spot): string {
  const sportType = spot.type as SportType;
  if (sportType in SPORT_CSS_VARS) {
    return `rgb(var(${SPORT_CSS_VARS[sportType]}))`;
  }
  return 'rgb(var(--fg-muted))';
}

function buildMarkerIcon(
  Leaflet: typeof L,
  data: SpotData,
  selectedSport: GridSportFilter,
  showWind: boolean,
): L.DivIcon {
  const { spot, conditions } = data;
  const score = getBestScore(data, selectedSport);
  const sportColor = getSpotRgb(spot);
  const scoreColor = getScoreRgb(score);
  const diffColor = getDifficultyMarkerColor(spot.difficulty);
  const windKtNum = conditions.windSpeed * MS_TO_KNOTS;

  const windArrowHtml = showWind
    ? `<div class="ventu-wind-arrow">${buildMapWindArrowSvg(conditions.windDirection, windKtNum)}</div>`
    : '';

  return Leaflet.divIcon({
    className: 'spot-marker',
    html: `
      <div class="ventu-spot-marker-wrap ventu-marker-enter" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
        ${windArrowHtml}
        <div style="position:relative;">
          <div class="ventu-spot-marker-dot" style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: ${sportColor};
            border: 2px solid ${scoreColor};
            box-shadow: 0 0 8px ${sportColor}66, 0 2px 4px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
            color: #fff;
            text-shadow: 0 1px 2px rgba(0,0,0,0.4);
          ">${Math.round(score)}</div>
          <span style="
            position:absolute;
            top:-1px;
            right:-1px;
            width:9px;
            height:9px;
            border-radius:50%;
            background:${diffColor};
            border:1.5px solid rgba(255,255,255,0.9);
            box-shadow:0 1px 2px rgba(0,0,0,0.35);
          " title="difficulty"></span>
        </div>
      </div>
    `,
    iconSize: showWind ? [28, 48] : [28, 28],
    iconAnchor: showWind ? [14, 48] : [14, 14],
    popupAnchor: [0, showWind ? -50 : -16],
  });
}

function buildMarkerPopupContent(data: SpotData, locale: string): string {
  const { spot, conditions, allScores } = data;
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = conditions.swellPeriod ?? conditions.wavePeriod;
  const powerKw = resolveWavePowerKw(conditions);

  return renderSpotPopup({
    spot,
    locale,
    allScores,
    swellHeight: swellH.toFixed(1),
    swellPeriod: swellT.toFixed(0),
    windKnots: (conditions.windSpeed * MS_TO_KNOTS).toFixed(0),
    windDirection: getCardinalLabel(conditions.windDirection),
    waterTemp: conditions.waterTemp.toFixed(1),
    wavePowerKw: powerKw.toFixed(1),
    imageUrl: (() => {
      const src = getSpotImage(spot);
      return src.kind === 'image' ? src.src : undefined;
    })(),
    confidence: conditions.confidence,
    confidenceDetail: conditions.confidenceDetail,
  });
}

function buildMarkerCacheKey(
  data: SpotData,
  selectedSport: GridSportFilter,
  showWind: boolean,
  locale: string,
  useMobileSheet: boolean,
): string {
  const score = getBestScore(data, selectedSport);
  return [data.spot.id, selectedSport, score, showWind, locale, useMobileSheet].join(':');
}

function createSpotMarker(
  Leaflet: typeof L,
  data: SpotData,
  selectedSport: GridSportFilter,
  locale: string,
  showWind: boolean,
  options: {
    useMobileSheet: boolean;
    onMobileTap?: (data: SpotData) => void;
    onSpotSelect?: (spotId: string) => void;
  },
): L.Marker {
  const { spot } = data;
  const icon = buildMarkerIcon(Leaflet, data, selectedSport, showWind);
  const marker = Leaflet.marker([spot.lat, spot.lon], { icon });
  (marker as L.Marker & { spotScore?: number }).spotScore = getBestScore(data, selectedSport);

  if (!options.useMobileSheet) {
    marker.bindPopup(buildMarkerPopupContent(data, locale), {
      className: 'spot-popup',
      maxWidth: 280,
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
    });

    marker.on('popupopen', () => {
      const root = marker.getPopup()?.getElement();
      if (!root) return;

      const detailBtn = root.querySelector('.ventu-popup-detail');
      if (detailBtn) {
        detailBtn.addEventListener(
          'click',
          (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            options.onSpotSelect?.(spot.id);
            marker.closePopup();
          },
          { once: true },
        );
      }

      root.querySelectorAll('a[href], .ventu-popup-directions').forEach((anchor) => {
        anchor.addEventListener('click', (ev) => ev.stopPropagation());
      });
    });
  }

  marker.on('click', (e) => {
    Leaflet.DomEvent.stopPropagation(e);
    if (options.useMobileSheet) {
      options.onMobileTap?.(data);
    }
  });

  return marker;
}

function readClusterPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(MAP_CLUSTER_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* noop */ }
  return false;
}

function readWindPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MAP_WIND_LS_KEY) === '1';
  } catch { /* noop */ }
  return false;
}

// ─── Component ───
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
  fullscreenBelowHeader = false,
  onExitFullscreen: onExitFullscreenOverride,
}: SpotMapInteractiveProps) {
  const isHeroEmbed = embedMode === 'hero';
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const markersCacheRef = useRef<Map<string, L.Marker>>(new Map());
  const didFitBoundsRef = useRef(false);
  const filterBoundsKeyRef = useRef('');
  const onSpotSelectRef = useRef(onSpotSelect);
  const LRef = useRef<typeof L | null>(null);

  useEffect(() => {
    onSpotSelectRef.current = onSpotSelect;
  }, [onSpotSelect]);
  const [isReady, setIsReady] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('map');
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const [windEnabled, setWindEnabled] = useState(readWindPref);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [sheetSpot, setSheetSpot] = useState<MapSpotSheetData | null>(null);
  const isPt = locale === 'pt';
  const t = getTranslation(validateLocale(locale));

  // Mobile viewport — bottom sheet instead of Leaflet popup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Restore persisted map preferences
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('ventu.map.basemap');
      if (saved === 'map' || saved === 'satellite') {
        setBasemapMode(saved);
      }
    } catch { /* noop */ }
  }, []);

  // Detect theme
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkTheme = () => {
      const hasCoast = document.documentElement.classList.contains('theme-ocean');
      setIsDark(!hasCoast);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Initialize map and cluster group
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;
    if (mapInstanceRef.current) return;

    let cancelled = false;

    (async () => {
      const Leaflet = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      if (cancelled) return;

      LRef.current = Leaflet;

      const map = Leaflet.map(mapRef.current!, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
        ...(isHeroEmbed
          ? {
              scrollWheelZoom: false,
              dragging: false,
              touchZoom: false,
              doubleClickZoom: false,
              boxZoom: false,
              keyboard: false,
            }
          : {}),
      });

      const darkOnInit = !document.documentElement.classList.contains('theme-ocean');
      const tileUrl = darkOnInit ? TILE_URLS.dark : TILE_URLS.light;
      tileLayerRef.current = Leaflet.tileLayer(tileUrl, {
        attribution: TILE_ATTRIBUTIONS.carto,
        subdomains: 'abcd',
        maxZoom: MAX_ZOOM,
      }).addTo(map);

      if (!isHeroEmbed) {
        Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);
        Leaflet.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
      }

      const mcg = Leaflet.markerClusterGroup({
        ...CLUSTER_CONFIG,
        iconCreateFunction: createClusterIconFunction(Leaflet),
      });
      const lg = Leaflet.layerGroup();
      clusterGroupRef.current = mcg;
      markersGroupRef.current = lg;
      map.addLayer(mcg);

      mapInstanceRef.current = map;
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
        markersGroupRef.current = null;
        didFitBoundsRef.current = false;
        tileLayerRef.current = null;
      }
    };
  }, [isHeroEmbed]);

  // Switch basemap tiles
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url: string;
    let attribution: string;

    if (basemapMode === 'satellite') {
      url = TILE_URLS.satellite;
      attribution = TILE_ATTRIBUTIONS.esri;
    } else {
      url = isDark ? TILE_URLS.dark : TILE_URLS.light;
      attribution = TILE_ATTRIBUTIONS.carto;
    }

    tileLayerRef.current = Leaflet.tileLayer(url, {
      attribution,
      subdomains: 'abcd',
      maxZoom: MAX_ZOOM,
    }).addTo(map);
  }, [basemapMode, isDark, isReady]);

  // Handle basemap toggle
  const handleBasemapChange = useCallback((mode: BasemapMode) => {
    setBasemapMode(mode);
    try {
      localStorage.setItem('ventu.map.basemap', mode);
    } catch { /* noop */ }
  }, []);

  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  const enterFullscreen = useCallback(() => {
    prevFocusRef.current = document.activeElement;
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    setSheetSpot(null);
    if (onExitFullscreenOverride) {
      onExitFullscreenOverride();
    } else {
      setIsFullscreen(false);
    }
  }, [onExitFullscreenOverride]);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // Focus: enter fullscreen → exit control; exit → restore trigger
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

  const toggleCluster = useCallback(() => {
    setClusterEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_CLUSTER_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleWind = useCallback(() => {
    setWindEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_WIND_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const showWindOnMarkers = windEnabled && !clusterEnabled;

  // Recalculate Leaflet size when toggling fullscreen or resizing
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const raf = requestAnimationFrame(() => {
      if (mapInstanceRef.current) map.invalidateSize();
    });
    const t = window.setTimeout(() => {
      if (mapInstanceRef.current) map.invalidateSize();
    }, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isFullscreen, isReady]);

  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isReady]);

  // Lock page scroll while map is fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  // Escape: close sheet first, then exit fullscreen
  useEffect(() => {
    if (!isFullscreen && !sheetSpot) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sheetSpot) {
        e.preventDefault();
        setSheetSpot(null);
        return;
      }
      if (isFullscreen) exitFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, sheetSpot, exitFullscreen]);

  // Fallback: popup buttons (Leaflet pane) — capture so clicks register before map handlers
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.ventu-popup-detail');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const spotId = btn.getAttribute('data-spot-id');
      if (spotId) onSpotSelectRef.current?.(spotId);
    };
    container.addEventListener('click', onClick, true);
    return () => container.removeEventListener('click', onClick, true);
  }, [isReady]);

  // Markers: reuse cached Leaflet markers when possible (see TODO below).
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current || !clusterGroupRef.current || !markersGroupRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    const map = mapInstanceRef.current;
    const mcg = clusterGroupRef.current;
    const lg = markersGroupRef.current;
    const cache = markersCacheRef.current;

    map.closePopup();
    setSheetSpot(null);
    mcg.clearLayers();
    lg.clearLayers();

    if (clusterEnabled) {
      if (map.hasLayer(lg)) map.removeLayer(lg);
      if (!map.hasLayer(mcg)) map.addLayer(mcg);
    } else {
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      if (!map.hasLayer(lg)) map.addLayer(lg);
    }

    const boundsKey = `${spotsData.length}:${selectedSport}:${selectedRegion}:${spotsData.map((d) => d.spot.id).join(',')}`;
    if (filterBoundsKeyRef.current !== boundsKey) {
      filterBoundsKeyRef.current = boundsKey;
      didFitBoundsRef.current = false;
    }

    if (spotsData.length === 0) return;

    const nextIds = new Set(spotsData.map((d) => d.spot.id));
    for (const [id, marker] of cache) {
      if (!nextIds.has(id)) {
        marker.remove();
        cache.delete(id);
      }
    }

    const bounds = Leaflet.latLngBounds([]);
    const useMobileSheet = isMobile;

    spotsData.forEach((data) => {
      const cacheKey = buildMarkerCacheKey(
        data,
        selectedSport,
        showWindOnMarkers,
        locale,
        useMobileSheet,
      );
      let marker = cache.get(data.spot.id);
      const meta = marker as (L.Marker & { ventuKey?: string }) | undefined;

      if (!marker || meta?.ventuKey !== cacheKey) {
        if (marker) {
          marker.remove();
          cache.delete(data.spot.id);
        }
        marker = createSpotMarker(Leaflet, data, selectedSport, locale, showWindOnMarkers, {
          useMobileSheet,
          onMobileTap: setSheetSpot,
          onSpotSelect,
        });
        (marker as L.Marker & { ventuKey?: string }).ventuKey = cacheKey;
        cache.set(data.spot.id, marker);
      }

      if (clusterEnabled) {
        mcg.addLayer(marker);
      } else {
        lg.addLayer(marker);
      }
      if (includeSpotInViewportBounds(data.spot, selectedRegion)) {
        bounds.extend([data.spot.lat, data.spot.lon]);
      }
    });

    if (!didFitBoundsRef.current && bounds.isValid()) {
      const fitMaxZoom = isMobile ? 9 : 11;
      map.fitBounds(bounds, {
        padding: isMobile ? [16, 16] : [40, 40],
        maxZoom: fitMaxZoom,
      });
      didFitBoundsRef.current = true;
    }

    // TODO(perf): diff marker event handlers when toggling mobile/desktop without full cache bust;
    // popup vs sheet mode still requires recreate today when isMobile changes.
  }, [
    spotsData,
    selectedSport,
    selectedRegion,
    isReady,
    clusterEnabled,
    showWindOnMarkers,
    locale,
    onSpotSelect,
    isMobile,
  ]);

  const exitFullscreenLabel = t.map.exitFullscreen;
  const clusterLabel = clusterEnabled ? t.map.showAllSpots : t.map.clusterSpots;
  const windLabel = windEnabled ? t.map.hideWind : t.map.showWind;
  const windHint = clusterEnabled && windEnabled ? t.map.windNeedsShowAll : null;

  return (
    <div
      className={
        isFullscreen
          ? fullscreenBelowHeader
            ? 'fixed left-0 right-0 bottom-0 z-40 w-full overflow-hidden bg-surface-1/[0.04] top-16'
            : 'fixed inset-0 z-[1100] w-full overflow-hidden bg-surface-1/[0.04] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : isHeroEmbed
            ? 'relative w-full h-full overflow-hidden bg-surface-1/[0.04]'
            : 'relative w-full rounded-2xl border border-divider overflow-hidden bg-surface-1/[0.04]'
      }
      style={
        isFullscreen
          ? fullscreenBelowHeader
            ? { height: 'calc(100dvh - 4rem)' }
            : { height: '100dvh' }
          : isHeroEmbed
            ? { height: '100%' }
            : { height: 'clamp(300px, 50vh, 600px)' }
      }
      data-map-fullscreen={isFullscreen ? 'true' : 'false'}
      data-map-hud={isFullscreen && mapHud ? 'visible' : 'hidden'}
      data-map-cluster={clusterEnabled ? 'true' : 'false'}
      data-map-wind={showWindOnMarkers ? 'true' : 'false'}
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
          {!isFullscreen && !isHeroEmbed && (
            <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
              <button
                ref={fullscreenBtnRef}
                type="button"
                onClick={enterFullscreen}
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border border-divider bg-bg-elevated text-fg text-xs font-semibold shadow-card hover:bg-surface-1/[0.04] transition-colors duration-150 touch-manipulation"
                aria-label={t.map.exploreMode}
                aria-expanded={isFullscreen}
              >
                <Maximize2 className="w-4 h-4 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{t.map.exploreMode}</span>
              </button>
              <button
                type="button"
                onClick={toggleCluster}
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border border-divider bg-bg-elevated text-fg text-xs font-semibold shadow-card hover:bg-surface-1/[0.04] transition-colors duration-150 touch-manipulation"
                aria-label={clusterLabel}
                aria-pressed={!clusterEnabled}
              >
                {clusterEnabled ? (
                  <MapPin className="w-4 h-4 shrink-0" aria-hidden />
                ) : (
                  <Layers className="w-4 h-4 shrink-0" aria-hidden />
                )}
                <span className="hidden sm:inline">{clusterLabel}</span>
              </button>
              <button
                type="button"
                onClick={toggleWind}
                title={windHint ?? undefined}
                className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border shadow-card transition-colors duration-150 touch-manipulation text-xs font-semibold ${
                  showWindOnMarkers
                    ? 'border-data-wind/40 bg-data-wind/15 text-fg'
                    : windEnabled && clusterEnabled
                      ? 'border-divider bg-bg-elevated text-fg-muted opacity-80'
                      : 'border-divider bg-bg-elevated text-fg hover:bg-surface-1/[0.04]'
                }`}
                aria-label={windLabel}
                aria-pressed={showWindOnMarkers}
              >
                <Wind className="w-4 h-4 shrink-0 text-data-wind" aria-hidden />
                <span className="hidden sm:inline">{windLabel}</span>
              </button>
            </div>
          )}

          {!isFullscreen && !isHeroEmbed && (
            <MapLayerToggle
              current={basemapMode}
              onChange={handleBasemapChange}
              isPt={isPt}
            />
          )}

          {!isHeroEmbed && (
            <MapLegend locale={locale} reserveHudSpace={isFullscreen} />
          )}

          {!isFullscreen && !isHeroEmbed && (
            <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
              {t.map.mapDataHint}
            </p>
          )}

          {windHint && !isFullscreen && !isHeroEmbed && (
            <p
              role="status"
              className="absolute top-3 left-3 mt-[148px] z-[1000] max-w-[220px] px-2 py-1 rounded-input text-meta-sm text-score-fair bg-bg-elevated/95 border border-score-fair/30 shadow-sm pointer-events-none sm:max-w-xs"
            >
              {windHint}
            </p>
          )}

          {mapHud && isFullscreen && (
            <MapExploreHud
              {...mapHud}
              visible
              isPt={isPt}
              basemapMode={basemapMode}
              onBasemapChange={handleBasemapChange}
              clusterEnabled={clusterEnabled}
              onToggleCluster={toggleCluster}
              windEnabled={windEnabled}
              showWindOnMarkers={showWindOnMarkers}
              onToggleWind={toggleWind}
              onExitFullscreen={exitFullscreen}
              windHint={windHint}
              exploreModeLabel={t.map.exploreMode}
              layerMapLabel={t.map.layerMap}
              layerSatelliteLabel={t.map.layerSatellite}
              clusterLabel={clusterLabel}
              windLabel={windLabel}
              exitLabel={exitFullscreenLabel}
            />
          )}

          {isMobile && (
            <MapSpotSheet
              data={sheetSpot}
              selectedSport={selectedSport}
              locale={locale}
              onClose={() => setSheetSpot(null)}
              onViewSpot={onSpotSelect}
            />
          )}
        </>
      )}
    </div>
  );
}
