'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Layers, HelpCircle, MapPin, Maximize2, Wind, Zap } from 'lucide-react';
import type L from 'leaflet';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { clearLeafletContainer, unlockPageInteraction } from '@/lib/mapFullscreen';
import type { GridSportFilter } from '@/lib/sportRatings';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';
import MapExploreHud, { type MapExploreHudProps } from './MapExploreHud';
import MapSpotSheet, { type MapSpotSheetData } from './MapSpotSheet';
import MapLegend from './MapLegend';
import MapLayerToggle from './MapLayerToggle';
import WindRingLegend from './WindRingLegend';
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
  MAP_ONLY_ON_LS_KEY,
} from '@/lib/map-constants';
import { getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { hasSeenWindRingLegend } from '@/lib/windRingLegend';
import { getSpotImage } from '@/lib/spotImage';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import { spotMeetsOnFilter } from '@/lib/gridSpotFilters';
import type { MapSpotData } from './mapSpotData';
import { getBestScore } from './mapSpotData';
import { includeSpotInViewportBounds } from './mapViewportBounds';
import { readClusterPref, readWindPref, readOnlyOnPref } from './mapHudPrefs';
import {
  buildMarkerCacheKey,
  createSpotMarker,
  runChunked,
  MARKER_ADD_CHUNK_SIZE,
  MARKER_ADD_CHUNK_SIZE_MOBILE,
  MARKER_CHUNK_YIELD_MS_MOBILE,
} from './mapMarkers';

type SpotData = MapSpotData;

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
  /** Home hero: fill parent, hide corner controls (overlay has filters). */
  embedMode?: 'default' | 'hero';
  /** Start in explore/fullscreen mode (e.g. /mapa page). */
  initialFullscreen?: boolean;
  /** Fullscreen map below fixed header (top offset 4rem). */
  fullscreenBelowHeader?: boolean;
  /** Override exit fullscreen (e.g. navigate home). */
  onExitFullscreen?: () => void;
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
  const markerChunkCancelRef = useRef(false);
  const didFitBoundsRef = useRef(false);
  const filterBoundsKeyRef = useRef('');
  const onSpotSelectRef = useRef(onSpotSelect);
  const LRef = useRef<typeof L | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onSpotSelectRef.current = onSpotSelect;
  }, [onSpotSelect]);
  const [isReady, setIsReady] = useState(false);
  /** Delay marker build so the map is pan/zoomable first (esp. mobile). */
  const [allowMarkers, setAllowMarkers] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('map');
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const [windEnabled, setWindEnabled] = useState(readWindPref);
  const [onlyOnEnabled, setOnlyOnEnabled] = useState(readOnlyOnPref);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [sheetSpot, setSheetSpot] = useState<MapSpotSheetData | null>(null);
  const [hudCollapsed, setHudCollapsed] = useState(true);
  const isPt = locale === 'pt';
  const t = getTranslation(validateLocale(locale));

  useEffect(() => {
    if (!isFullscreen) setHudCollapsed(true);
  }, [isFullscreen]);

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
    const container = mapRef.current;

    const teardownMap = () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          /* noop */
        }
        mapInstanceRef.current = null;
      }
      markersCacheRef.current.forEach((marker) => {
        try {
          marker.remove();
        } catch {
          /* noop */
        }
      });
      markersCacheRef.current.clear();
      clusterGroupRef.current = null;
      markersGroupRef.current = null;
      tileLayerRef.current = null;
      LRef.current = null;
      didFitBoundsRef.current = false;
      filterBoundsKeyRef.current = '';
      clearLeafletContainer(container);
      if (mountedRef.current) setIsReady(false);
    };

    (async () => {
      const mobileInit =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

      await Promise.all([
        import('leaflet/dist/leaflet.css'),
        import('leaflet.markercluster/dist/MarkerCluster.css'),
        import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
      ]);
      const Leaflet = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      if (cancelled || !mapRef.current) return;

      clearLeafletContainer(container);
      LRef.current = Leaflet;

      const map = Leaflet.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
        // Canvas renderer on mobile — fewer DOM nodes while panning
        ...(mobileInit ? { renderer: Leaflet.canvas() } : {}),
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

      if (cancelled) {
        map.remove();
        clearLeafletContainer(container);
        return;
      }

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
        ...(mobileInit
          ? { chunkInterval: 200, chunkDelay: 80, maxClusterRadius: 72 }
          : {}),
        iconCreateFunction: createClusterIconFunction(Leaflet, { simple: mobileInit }),
      });
      const lg = Leaflet.layerGroup();
      clusterGroupRef.current = mcg;
      markersGroupRef.current = lg;
      map.addLayer(mcg);

      if (cancelled) {
        map.remove();
        clearLeafletContainer(container);
        return;
      }

      mapInstanceRef.current = map;
      if (mountedRef.current) setIsReady(true);
    })();

    return () => {
      cancelled = true;
      teardownMap();
    };
  }, [isHeroEmbed]);

  // Basemap + theme on Leaflet container (wind ring halo on satellite)
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const el = mapInstanceRef.current.getContainer();
    el.dataset.basemap = basemapMode;
    el.dataset.mapTheme = isDark ? 'dark' : 'light';
  }, [basemapMode, isDark, isReady]);

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
  const windButtonRef = useRef<HTMLButtonElement>(null);
  const windLegendAutoQueuedRef = useRef(false);
  const [windLegendOpen, setWindLegendOpen] = useState(false);
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
    unlockPageInteraction();
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
      if (next) {
        setClusterEnabled(false);
        try {
          localStorage.setItem(MAP_CLUSTER_LS_KEY, '0');
        } catch { /* noop */ }
      }
      try {
        localStorage.setItem(MAP_WIND_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleOnlyOn = useCallback(() => {
    setOnlyOnEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_ONLY_ON_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const showWindOnMarkers = windEnabled && !clusterEnabled && !isHeroEmbed;
  const activeCluster = isHeroEmbed ? true : clusterEnabled;

  const openWindLegend = useCallback(() => {
    setWindLegendOpen(true);
  }, []);

  const closeWindLegend = useCallback(() => {
    setWindLegendOpen(false);
  }, []);

  // First-time coach when wind rings become visible — defer until browser is idle
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

  // Performance measurement — marker creation timing
  const perfMeasure = useCallback((label: string) => {
    if (typeof performance !== 'undefined') {
      performance.mark(`ventu-map-${label}`);
      const entries = performance.getEntriesByType('measure').filter(
        (e) => e.name.startsWith('ventu-map-'),
      );
      if (entries.length > 1) {
        const last = entries[entries.length - 1] as PerformanceMeasure;
        const prev = entries[entries.length - 2] as PerformanceMeasure;
        if (last.duration > 0) {
          console.log(`[map perf] ${label}: ${Math.round(last.duration)}ms`);
        }
      }
    }
  }, []);

  const visibleSpots = useMemo(() => {
    if (!onlyOnEnabled) return spotsData;
    return spotsData.filter((d) => spotMeetsOnFilter(d, selectedSport));
  }, [spotsData, onlyOnEnabled, selectedSport]);

  // Recalculate Leaflet size when toggling fullscreen or resizing
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const raf = requestAnimationFrame(() => {
      if (mapInstanceRef.current) map.invalidateSize({ animate: false });
    });
    // One delayed sync is enough — cascading 0/150/300 timers jank mobile
    const t = window.setTimeout(() => {
      if (mapInstanceRef.current) map.invalidateSize({ animate: false });
    }, isMobile ? 100 : 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isFullscreen, isReady, isMobile]);

  // Map paints first; markers load after a beat so touch isn't blocked
  useEffect(() => {
    if (!isReady) {
      setAllowMarkers(false);
      return;
    }
    const delay = isMobile ? 280 : 0;
    const t = window.setTimeout(() => setAllowMarkers(true), delay);
    return () => window.clearTimeout(t);
  }, [isReady, isMobile]);

  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isReady]);

  // Hero embed: keep Leaflet sized to the hero plane and refit Portugal into the right pane
  useEffect(() => {
    if (!isHeroEmbed || !isReady || !mapInstanceRef.current || !mapRef.current) return;
    const host = mapRef.current.closest('[data-map-hero-teaser]');
    if (!host) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    const fitHero = () => {
      const bounds = Leaflet.latLngBounds([]);
      visibleSpots.forEach((data) => {
        if (includeSpotInViewportBounds(data.spot, selectedRegion)) {
          bounds.extend([data.spot.lat, data.spot.lon]);
        }
      });
      if (!bounds.isValid()) return;
      map.invalidateSize({ animate: false });
      const leftPad = isMobile ? 20 : 300;
      map.fitBounds(bounds, {
        paddingTopLeft: Leaflet.point(leftPad, 48),
        paddingBottomRight: Leaflet.point(40, 96),
        maxZoom: isMobile ? 8 : 10,
        animate: false,
      });
    };

    const ro = new ResizeObserver(() => fitHero());
    ro.observe(host);
    const t1 = window.setTimeout(fitHero, 0);
    const t2 = window.setTimeout(fitHero, 150);
    const t3 = window.setTimeout(fitHero, 500);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [isHeroEmbed, isReady, visibleSpots, selectedRegion, isMobile]);

  // Lock page scroll while map is fullscreen — always clear on exit (Drawer pattern)
  useEffect(() => {
    if (!isFullscreen) {
      unlockPageInteraction();
      return;
    }

    document.body.classList.add('ventu-map-fullscreen-open');
    document.body.style.overflow = 'hidden';

    return () => {
      unlockPageInteraction();
    };
  }, [isFullscreen]);

  // Leaflet keeps viewport-sized panes until invalidateSize runs after layout settles
  useEffect(() => {
    if (isFullscreen || !isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const sync = () => map.invalidateSize({ animate: false });
    sync();
    const t = window.setTimeout(sync, isMobile ? 100 : 150);
    return () => {
      window.clearTimeout(t);
    };
  }, [isFullscreen, isReady, isMobile]);

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
      if (!onSpotSelectRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const spotId = btn.getAttribute('data-spot-id');
      if (spotId) onSpotSelectRef.current(spotId);
    };
    container.addEventListener('click', onClick, true);
    return () => container.removeEventListener('click', onClick, true);
  }, [isReady]);

  // Markers: reuse cached Leaflet markers when possible.
  useEffect(() => {
    if (
      !allowMarkers ||
      !isReady ||
      !mapInstanceRef.current ||
      !clusterGroupRef.current ||
      !markersGroupRef.current
    ) {
      return;
    }
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
      if (!nextIds.has(id)) {
        marker.remove();
        cache.delete(id);
      }
    }

    const bounds = Leaflet.latLngBounds([]);
    const useMobileSheet = isMobile;
    const chunkSize = isMobile ? MARKER_ADD_CHUNK_SIZE_MOBILE : MARKER_ADD_CHUNK_SIZE;
    const yieldMs = isMobile ? MARKER_CHUNK_YIELD_MS_MOBILE : 0;

    const fitBoundsIfNeeded = () => {
      if (didFitBoundsRef.current || !bounds.isValid() || !mapInstanceRef.current) return;
      const fitMap = mapInstanceRef.current;
      fitMap.invalidateSize({ animate: false });
      if (isHeroEmbed) {
        const leftPad = isMobile ? 20 : 300;
        fitMap.fitBounds(bounds, {
          paddingTopLeft: Leaflet.point(leftPad, 48),
          paddingBottomRight: Leaflet.point(40, 96),
          maxZoom: isMobile ? 8 : 10,
          animate: false,
        });
      } else {
        const fitMaxZoom = isMobile ? 9 : 11;
        fitMap.fitBounds(bounds, {
          padding: isMobile ? [16, 16] : [40, 40],
          maxZoom: fitMaxZoom,
          animate: false,
        });
      }
      didFitBoundsRef.current = true;
    };

    markerChunkCancelRef.current = false;
    runChunked(
      visibleSpots,
      (batch) => {
        const toCluster: L.Marker[] = [];
        const toPlain: L.Marker[] = [];

        for (const data of batch) {
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

          if (activeCluster) {
            toCluster.push(marker);
          } else {
            toPlain.push(marker);
          }
          if (includeSpotInViewportBounds(data.spot, selectedRegion)) {
            bounds.extend([data.spot.lat, data.spot.lon]);
          }
        }

        if (toCluster.length > 0) mcg.addLayers(toCluster);
        if (toPlain.length > 0) toPlain.forEach((m) => lg.addLayer(m));
      },
      markerChunkCancelRef,
      fitBoundsIfNeeded,
      chunkSize,
      yieldMs,
    );

    return () => {
      markerChunkCancelRef.current = true;
    };
  }, [
    allowMarkers,
    visibleSpots,
    onlyOnEnabled,
    selectedSport,
    selectedRegion,
    isReady,
    clusterEnabled,
    showWindOnMarkers,
    locale,
    onSpotSelect,
    isMobile,
    isHeroEmbed,
    activeCluster,
  ]);

  const exitFullscreenLabel = t.map.exitFullscreen;
  const clusterLabel = clusterEnabled ? t.map.showAllSpots : t.map.clusterSpots;
  const windLabel = windEnabled ? t.map.hideWind : t.map.showWind;
  // Only when cluster blocks wind rings — legend copy lives behind "?"
  const windHint =
    clusterEnabled && windEnabled ? t.map.windNeedsShowAll : null;
  const onlyOnLabel = onlyOnEnabled ? t.map.onlyOnOff : t.map.onlyOn;
  const onlyOnHint = t.map.onlyOnHint;
  const windLegendHelpLabel = t.map.windRingLegend.help;
  const hudSpotCount = onlyOnEnabled ? visibleSpots.length : (mapHud?.spotCount ?? visibleSpots.length);

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
          {!isHeroEmbed && (!isFullscreen || !mapHud) && (
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
              <div className="inline-flex flex-col gap-1">
                <div className="inline-flex items-center gap-0.5">
                  <button
                    ref={windButtonRef}
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
                  <button
                    type="button"
                    onClick={openWindLegend}
                    className="flex items-center justify-center min-h-[36px] min-w-[36px] rounded-input border border-divider bg-bg-elevated text-fg-muted hover:bg-surface-1/[0.04] hover:text-fg transition-colors duration-150"
                    aria-label={windLegendHelpLabel}
                  >
                    <HelpCircle className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleOnlyOn}
                title={onlyOnHint}
                className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border shadow-card transition-colors duration-150 touch-manipulation text-xs font-semibold ${
                  onlyOnEnabled
                    ? 'border-score-good/40 bg-score-good/15 text-fg'
                    : 'border-divider bg-bg-elevated text-fg hover:bg-surface-1/[0.04]'
                }`}
                aria-label={onlyOnLabel}
                aria-pressed={onlyOnEnabled}
              >
                <Zap className="w-4 h-4 shrink-0 text-score-good" aria-hidden />
                <span className="hidden sm:inline">{onlyOnLabel}</span>
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
            <MapLegend
              locale={locale}
              reserveHudSpace={isFullscreen}
              hudCompact={isFullscreen && hudCollapsed}
            />
          )}

          {!isFullscreen && !isHeroEmbed && (
            <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
              {t.map.mapDataHint}
            </p>
          )}

          {mapHud && isFullscreen && (
            <MapExploreHud
              {...mapHud}
              spotCount={hudSpotCount}
              visible
              isPt={isPt}
              basemapMode={basemapMode}
              onBasemapChange={handleBasemapChange}
              clusterEnabled={clusterEnabled}
              onToggleCluster={toggleCluster}
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
            />
          )}

          <WindRingLegend
            open={windLegendOpen}
            onClose={closeWindLegend}
            anchorRef={windButtonRef}
            locale={locale}
          />

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
