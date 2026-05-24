'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Layers, MapPin, Maximize2, Minimize2 } from 'lucide-react';
import type L from 'leaflet';
import { getTranslation, validateLocale } from '@/lib/i18n';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { wavePowerFromMarine, MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';
import { renderSpotPopup } from './SpotPopupContent';
import MapFullscreenHud from './MapFullscreenHud';
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
  getScoreRgb,
  SPORT_CSS_VARS,
} from '@/lib/map-constants';

// ─── Types ───
interface SpotData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

export interface MapHudProps {
  sportLabel: string;
  regionLabel: string;
  spotCount: number;
  onCount: number;
  marginalCount: number;
  lastUpdated: string | null;
  showClearFilters: boolean;
  onResetFilters: () => void;
  clearFiltersLabel: string;
}

interface SpotMapInteractiveProps {
  spotsData: SpotData[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  onSpotSelect?: (spotId: string) => void;
  mapHud?: MapHudProps;
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

function createSpotMarker(
  Leaflet: typeof L,
  data: SpotData,
  selectedSport: GridSportFilter,
  locale: string,
  onSpotSelect?: (spotId: string) => void,
): L.Marker {
  const { spot, conditions } = data;
  const score = getBestScore(data, selectedSport);
  const sportColor = getSpotRgb(spot);
  const scoreColor = getScoreRgb(score);
  const isPt = locale === 'pt';

  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = conditions.swellPeriod ?? conditions.wavePeriod;
  const powerKw =
    conditions.wavePowerKw ??
    wavePowerFromMarine({
      swellHeight: conditions.swellHeight,
      swellPeriod: conditions.swellPeriod,
      waveHeight: conditions.waveHeight,
      wavePeriod: conditions.wavePeriod,
    });

  const icon = Leaflet.divIcon({
    className: 'spot-marker',
    html: `
      <div style="
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
        cursor: pointer;
        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
      ">
        ${Math.round(score)}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });

  const marker = Leaflet.marker([spot.lat, spot.lon], { icon });
  (marker as L.Marker & { spotScore?: number }).spotScore = score;

  marker.bindPopup(
    renderSpotPopup({
      name: isPt ? spot.name : (spot.nameEn || spot.name),
      region: isPt ? spot.region : (spot.regionEn || spot.region),
      score,
      scoreColor,
      swellHeight: swellH.toFixed(1),
      swellPeriod: swellT.toFixed(0),
      windKnots: (conditions.windSpeed * MS_TO_KNOTS).toFixed(0),
      windDirection: getCardinalLabel(conditions.windDirection),
      wavePowerKw: powerKw.toFixed(1),
      spotSlug: spot.slug,
      spotId: spot.id,
      locale,
    }),
    { className: 'spot-popup', maxWidth: 280, closeButton: true, autoClose: true, closeOnClick: false },
  );

  marker.on('click', (e) => {
    Leaflet.DomEvent.stopPropagation(e);
    if (marker.isPopupOpen()) {
      onSpotSelect?.(spot.id);
    } else {
      marker.openPopup();
    }
  });

  if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
    marker.on('mouseover', () => marker.openPopup());
    marker.on('mouseout', () => marker.closePopup());
  }

  return marker;
}

function readClusterPref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (localStorage.getItem(MAP_CLUSTER_LS_KEY) === '0') return false;
  } catch { /* noop */ }
  return true;
}

// ─── Component ───
export default function SpotMapInteractive({
  spotsData,
  selectedSport,
  selectedRegion,
  locale,
  onSpotSelect,
  mapHud,
}: SpotMapInteractiveProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const isPt = locale === 'pt';
  const t = getTranslation(validateLocale(locale));

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
      });

      const tileUrl = isDark ? TILE_URLS.dark : TILE_URLS.light;
      tileLayerRef.current = Leaflet.tileLayer(tileUrl, {
        attribution: TILE_ATTRIBUTIONS.carto,
        subdomains: 'abcd',
        maxZoom: MAX_ZOOM,
      }).addTo(map);

      Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);
      Leaflet.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

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
  }, []);

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

  const enterFullscreen = useCallback(() => setIsFullscreen(true), []);
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  const toggleCluster = useCallback(() => {
    setClusterEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_CLUSTER_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

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

  // Escape closes fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, exitFullscreen]);

  // Popup "Ver condições" button (static HTML from renderSpotPopup)
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.ventu-popup-detail');
      if (!btn) return;
      const spotId = btn.getAttribute('data-spot-id');
      if (spotId) onSpotSelectRef.current?.(spotId);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, []);

  // Add/update markers (clustered or all visible)
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current || !clusterGroupRef.current || !markersGroupRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    const map = mapInstanceRef.current;
    const mcg = clusterGroupRef.current;
    const lg = markersGroupRef.current;
    mcg.clearLayers();
    lg.clearLayers();

    if (clusterEnabled) {
      if (map.hasLayer(lg)) map.removeLayer(lg);
      if (!map.hasLayer(mcg)) map.addLayer(mcg);
    } else {
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      if (!map.hasLayer(lg)) map.addLayer(lg);
    }

    const boundsKey = `${spotsData.length}:${selectedSport}:${selectedRegion}`;
    if (filterBoundsKeyRef.current !== boundsKey) {
      filterBoundsKeyRef.current = boundsKey;
      didFitBoundsRef.current = false;
    }

    if (spotsData.length === 0) return;

    const bounds = Leaflet.latLngBounds([]);

    spotsData.forEach((data) => {
      const marker = createSpotMarker(Leaflet, data, selectedSport, locale, onSpotSelect);
      if (clusterEnabled) {
        mcg.addLayer(marker);
      } else {
        lg.addLayer(marker);
      }
      bounds.extend([data.spot.lat, data.spot.lon]);
    });

    if (!didFitBoundsRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      didFitBoundsRef.current = true;
    }
  }, [spotsData, selectedSport, selectedRegion, isReady, clusterEnabled, locale, onSpotSelect]);

  const fullscreenLabel = t.map.fullscreen;
  const exitFullscreenLabel = t.map.exitFullscreen;
  const clusterLabel = clusterEnabled ? t.map.showAllSpots : t.map.clusterSpots;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[1100] w-full overflow-hidden bg-surface-1 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : 'relative w-full rounded-2xl border border-divider overflow-hidden bg-surface-1'
      }
      style={isFullscreen ? { height: '100dvh' } : { height: 'clamp(300px, 50vh, 600px)' }}
      data-map-fullscreen={isFullscreen ? 'true' : 'false'}
      data-map-cluster={clusterEnabled ? 'true' : 'false'}
    >
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-1 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
            <span className="text-sm text-fg-muted">{t.map.loading}</span>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" aria-label={isPt ? 'Mapa dos spots' : 'Spots map'} />

      {isReady && (
        <>
          <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
            <button
              type="button"
              onClick={isFullscreen ? exitFullscreen : enterFullscreen}
              className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg border border-[rgb(var(--divider))] bg-[rgb(var(--bg-elevated))] text-[rgb(var(--fg))] text-xs font-semibold shadow-lg hover:bg-[rgb(var(--surface-1))] transition-colors touch-manipulation"
              aria-label={isFullscreen ? exitFullscreenLabel : fullscreenLabel}
              aria-expanded={isFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 shrink-0" aria-hidden />
              ) : (
                <Maximize2 className="w-4 h-4 shrink-0" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {isFullscreen ? exitFullscreenLabel : fullscreenLabel}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleCluster}
              className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg border border-[rgb(var(--divider))] bg-[rgb(var(--bg-elevated))] text-[rgb(var(--fg))] text-xs font-semibold shadow-lg hover:bg-[rgb(var(--surface-1))] transition-colors touch-manipulation"
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
          </div>
          <MapLayerToggle
            current={basemapMode}
            onChange={handleBasemapChange}
            isPt={isPt}
          />
          <MapLegend locale={locale} />
          {isFullscreen && mapHud && (
            <MapFullscreenHud
              isPt={isPt}
              sportLabel={mapHud.sportLabel}
              regionLabel={mapHud.regionLabel}
              spotCount={mapHud.spotCount}
              onCount={mapHud.onCount}
              marginalCount={mapHud.marginalCount}
              lastUpdated={mapHud.lastUpdated}
              showClearFilters={mapHud.showClearFilters}
              onResetFilters={mapHud.onResetFilters}
              clearFiltersLabel={mapHud.clearFiltersLabel}
            />
          )}
        </>
      )}
    </div>
  );
}
