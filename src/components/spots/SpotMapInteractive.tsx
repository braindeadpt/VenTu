'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Layers, MapPin, Maximize2, Wind, Zap } from 'lucide-react';
import type L from 'leaflet';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { unlockPageInteraction } from '@/lib/mapFullscreen';
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
  MAP_ONLY_ON_LS_KEY,
  getScoreRgb,
} from '@/lib/map-constants';
import {
  buildCompoundSpotMarkerHtml,
  markerWindArrowLayout,
  markerPxForZoom,
  MARKER_MIN_PX,
} from '@/lib/mapWindArrow';
import { getMacroRegion } from '@/lib/regions';
import { getSpotImage } from '@/lib/spotImage';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import { spotMeetsOnFilter } from '@/lib/gridSpotFilters';

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

function buildMarkerIcon(
  Leaflet: typeof L,
  data: SpotData,
  selectedSport: GridSportFilter,
  showWind: boolean,
  locale: string,
  markerPx = MARKER_MIN_PX,
): L.DivIcon {
  const { conditions } = data;
  const score = getBestScore(data, selectedSport);
  const scoreRgb = getScoreRgb(score);
  const windKtNum = conditions.windSpeed * MS_TO_KNOTS;

  const markerHtml = showWind
    ? buildCompoundSpotMarkerHtml(
        score,
        scoreRgb,
        conditions.windDirection,
        windKtNum,
        true,
        locale,
        markerPx,
      )
    : `
    <div class="ventu-spot-marker-wrap ventu-marker-enter" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
      <div class="ventu-marker-drop" style="position:relative;width:34px;">
        <div class="ventu-marker-drop-circle" style="
          width:34px;height:34px;border-radius:50%;
          background:${scoreRgb};
          border:2.5px solid rgb(var(--bg-elevated));
          box-shadow:0 3px 6px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
        ">
          <span style="
            font-family:var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace;
            font-variant-numeric:tabular-nums;
            font-size:13px;font-weight:700;color:#fff;
            line-height:1;white-space:nowrap;
          ">${Math.round(score)}</span>
        </div>
        <div class="ventu-marker-drop-tail" aria-hidden style="
          width:0;height:0;margin:0 auto -1px;
          border-left:6px solid transparent;border-right:6px solid transparent;
          border-top:8px solid ${scoreRgb};
        "></div>
      </div>
    </div>
  `;

  const layout = markerWindArrowLayout(showWind, markerPx);

  return Leaflet.divIcon({
    className: 'spot-marker',
    html: markerHtml,
    iconSize: layout.iconSize,
    iconAnchor: layout.iconAnchor,
    popupAnchor: layout.popupAnchor,
  });
}

function buildMarkerPopupContent(
  data: SpotData,
  locale: string,
  selectedSport: GridSportFilter,
): string {
  const { spot, conditions, allScores } = data;
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = conditions.swellPeriod ?? conditions.wavePeriod;
  const powerKw = resolveWavePowerKw(conditions);
  const sportParam =
    selectedSport !== 'all' && selectedSport !== 'big-wave' ? selectedSport : undefined;

  return renderSpotPopup({
    spot,
    locale,
    detailHref: getSpotDetailHref(locale, spot.slug, sportParam),
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
  const windKey = showWind
    ? `${Math.round(data.conditions.windDirection)}:${Math.round(data.conditions.windSpeed * MS_TO_KNOTS)}`
    : '';
  return [data.spot.id, selectedSport, score, showWind, windKey, locale, useMobileSheet].join(':');
}

function createSpotMarker(
  Leaflet: typeof L,
  data: SpotData,
  selectedSport: GridSportFilter,
  locale: string,
  showWind: boolean,
  markerPx: number,
  options: {
    useMobileSheet: boolean;
    onMobileTap?: (data: SpotData) => void;
    onSpotSelect?: (spotId: string) => void;
  },
): L.Marker {
  const { spot } = data;
  const icon = buildMarkerIcon(Leaflet, data, selectedSport, showWind, locale, markerPx);
  const marker = Leaflet.marker([spot.lat, spot.lon], { icon });
  (marker as L.Marker & { spotScore?: number }).spotScore = getBestScore(data, selectedSport);

  if (!options.useMobileSheet) {
    marker.bindPopup(buildMarkerPopupContent(data, locale, selectedSport), {
      className: 'spot-popup',
      maxWidth: 280,
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
    });

    marker.on('popupopen', () => {
      // Spring scale on selected marker
      const el = marker.getElement();
      if (el) {
        const wrap = el.querySelector('.ventu-spot-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.classList.add('ventu-marker-selected');
      }

      const root = marker.getPopup()?.getElement();
      if (!root) return;

      const detailBtn = root.querySelector('.ventu-popup-detail');
      if (detailBtn) {
        detailBtn.addEventListener(
          'click',
          (ev) => {
            if (!options.onSpotSelect) return;
            ev.preventDefault();
            ev.stopPropagation();
            options.onSpotSelect(spot.id);
            marker.closePopup();
          },
          { once: true },
        );
      }

      root.querySelectorAll('a[href], .ventu-popup-directions').forEach((anchor) => {
        anchor.addEventListener('click', (ev) => ev.stopPropagation());
      });
    });

    marker.on('popupclose', () => {
      const el = marker.getElement();
      if (el) {
        const wrap = el.querySelector('.ventu-spot-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.classList.remove('ventu-marker-selected');
      }
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
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(MAP_WIND_LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* noop */ }
  return true;
}

function readOnlyOnPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MAP_ONLY_ON_LS_KEY) === '1';
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
  const [onlyOnEnabled, setOnlyOnEnabled] = useState(readOnlyOnPref);
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

  // Scale compound markers with zoom (CSS var — no marker rebuild)
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const el = map.getContainer();

    const syncMarkerSize = () => {
      const px = markerPxForZoom(map.getZoom());
      el.style.setProperty('--ventu-marker-px', `${px}px`);
      el.querySelectorAll<HTMLElement>('.ventu-compound-marker-wrap').forEach((node) => {
        const w = px;
        const h = Math.round((px / 88) * 94);
        node.style.width = `${w}px`;
        node.style.height = `${h}px`;
      });
    };

    syncMarkerSize();
    map.on('zoom zoomend', syncMarkerSize);
    return () => {
      map.off('zoom zoomend', syncMarkerSize);
    };
  }, [isReady]);

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
    const raf = requestAnimationFrame(sync);
    const t1 = window.setTimeout(sync, 0);
    const t2 = window.setTimeout(sync, 150);
    const t3 = window.setTimeout(sync, 320);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [isFullscreen, isReady]);

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

    if (activeCluster) {
      if (map.hasLayer(lg)) map.removeLayer(lg);
      if (!map.hasLayer(mcg)) map.addLayer(mcg);
    } else {
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      if (!map.hasLayer(lg)) map.addLayer(lg);
    }

    const boundsKey = `${visibleSpots.length}:${onlyOnEnabled}:${selectedSport}:${selectedRegion}:${visibleSpots.map((d) => d.spot.id).join(',')}`;
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
    const markerPx = showWindOnMarkers ? markerPxForZoom(map.getZoom()) : MARKER_MIN_PX;

    visibleSpots.forEach((data) => {
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
        marker = createSpotMarker(Leaflet, data, selectedSport, locale, showWindOnMarkers, markerPx, {
          useMobileSheet,
          onMobileTap: setSheetSpot,
          onSpotSelect,
        });
        (marker as L.Marker & { ventuKey?: string }).ventuKey = cacheKey;
        cache.set(data.spot.id, marker);
      }

      if (activeCluster) {
        mcg.addLayer(marker);
      } else {
        lg.addLayer(marker);
      }
      if (includeSpotInViewportBounds(data.spot, selectedRegion)) {
        bounds.extend([data.spot.lat, data.spot.lon]);
      }
    });

    if (!didFitBoundsRef.current && bounds.isValid()) {
      map.invalidateSize({ animate: false });
      if (isHeroEmbed) {
        const leftPad = isMobile ? 20 : 300;
        map.fitBounds(bounds, {
          paddingTopLeft: Leaflet.point(leftPad, 48),
          paddingBottomRight: Leaflet.point(40, 96),
          maxZoom: isMobile ? 8 : 10,
          animate: false,
        });
      } else {
        const fitMaxZoom = isMobile ? 9 : 11;
        map.fitBounds(bounds, {
          padding: isMobile ? [16, 16] : [40, 40],
          maxZoom: fitMaxZoom,
        });
      }
      didFitBoundsRef.current = true;
    }

    // TODO(perf): diff marker event handlers when toggling mobile/desktop without full cache bust;
    // popup vs sheet mode still requires recreate today when isMobile changes.
  }, [
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
  const windHint =
    clusterEnabled && windEnabled
      ? t.map.windNeedsShowAll
      : showWindOnMarkers
        ? t.map.windArrowHint
        : null;
  const onlyOnLabel = onlyOnEnabled ? t.map.onlyOnOff : t.map.onlyOn;
  const onlyOnHint = t.map.onlyOnHint;
  const hudSpotCount = onlyOnEnabled ? visibleSpots.length : (mapHud?.spotCount ?? visibleSpots.length);

  return (
    <div
      className={
        isFullscreen
          ? fullscreenBelowHeader
            ? 'fixed left-0 right-0 bottom-0 z-40 w-full overflow-hidden bg-surface-1/[0.04] top-16'
            : 'fixed inset-0 z-[1100] w-full overflow-hidden bg-surface-1/[0.04] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
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
