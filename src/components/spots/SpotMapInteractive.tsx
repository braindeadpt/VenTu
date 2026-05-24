'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useEffect, useRef, useState, useCallback } from 'react';
import type L from 'leaflet';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
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
  getScoreRgb,
  SPORT_CSS_VARS,
} from '@/lib/map-constants';

// ─── Types ───
interface SpotData {
  spot: Spot;
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  };
  allScores: Record<SportType, SportScore>;
}

interface SpotMapInteractiveProps {
  spotsData: SpotData[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  onSpotSelect?: (spotId: string) => void;
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

// ─── Component ───
export default function SpotMapInteractive({
  spotsData,
  selectedSport,
  selectedRegion,
  locale,
  onSpotSelect,
}: SpotMapInteractiveProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const LRef = useRef<typeof L | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('map');
  const isPt = locale === 'pt';

  // Restore persisted basemap preference
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
      map.addLayer(mcg);
      clusterGroupRef.current = mcg;

      mapInstanceRef.current = map;
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
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

  // Add/update markers and cluster
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current || !clusterGroupRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    const mcg = clusterGroupRef.current;
    mcg.clearLayers();

    if (spotsData.length === 0) return;

    const bounds = Leaflet.latLngBounds([]);

    spotsData.forEach((data) => {
      const { spot, conditions } = data;
      const score = getBestScore(data, selectedSport);
      const sportColor = getSpotRgb(spot);
      const scoreColor = getScoreRgb(score);

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

      (marker as any).spotScore = score;

      marker.on('click', () => {
        onSpotSelect?.(spot.id);
      });

      mcg.addLayer(marker);
      bounds.extend([spot.lat, spot.lon]);
    });

    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [spotsData, selectedSport, selectedRegion, isReady, locale]);

  return (
    <div className="relative w-full rounded-2xl border border-divider overflow-hidden bg-surface-1" style={{ height: 'clamp(300px, 50vh, 600px)' }}>
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-1 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
            <span className="text-sm text-fg-muted">
              {isPt ? 'A carregar mapa...' : 'Loading map...'}
            </span>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" aria-label={isPt ? 'Mapa dos spots' : 'Spots map'} />

      {isReady && (
        <>
          <MapLayerToggle
            current={basemapMode}
            onChange={handleBasemapChange}
            isPt={isPt}
          />
          <MapLegend locale={locale} />
        </>
      )}
    </div>
  );
}
