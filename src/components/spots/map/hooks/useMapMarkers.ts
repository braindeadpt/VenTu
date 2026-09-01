import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import type { MapSpotData } from '../../mapSpotData';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapSpotSheetData } from '../../MapSpotSheet';
import {
  buildMarkerCacheKey,
  createSpotMarker,
  runChunked,
  MARKER_ADD_CHUNK_SIZE,
  MARKER_ADD_CHUNK_SIZE_MOBILE,
  MARKER_CHUNK_YIELD_MS_MOBILE,
} from '../../mapMarkers';
import { includeSpotInViewportBounds } from '../../mapViewportBounds';

const MARKER_ADD_CHUNK_SIZE_LOCAL = MARKER_ADD_CHUNK_SIZE;

interface UseMapMarkersParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  clusterGroupRef: React.MutableRefObject<L.MarkerClusterGroup | null>;
  markersGroupRef: React.MutableRefObject<L.LayerGroup | null>;
  markersCacheRef: React.MutableRefObject<Map<string, L.Marker>>;
  visibleSpots: MapSpotData[];
  onlyOnEnabled: boolean;
  selectedSport: GridSportFilter;
  selectedRegion: string | null;
  isReady: boolean;
  isMobile: boolean;
  isHeroEmbed: boolean;
  activeCluster: boolean;
  showWindOnMarkers: boolean;
  locale: string;
  warningsBySpot: Map<string, MapMarkerWarning>;
  onSpotSelect?: (spotId: string) => void;
  setSheetSpot: React.Dispatch<React.SetStateAction<MapSpotSheetData | null>>;
  closePopupAndSheet: () => void;
}

/**
 * Owns marker rendering: cache, chunked insertion, cluster/plain switching,
 * and viewport fit-bounds. Extracted from SpotMapInteractive so the parent
 * component owns only layout and controls.
 */
export function useMapMarkers({
  mapInstanceRef,
  LRef,
  clusterGroupRef,
  markersGroupRef,
  markersCacheRef,
  visibleSpots,
  onlyOnEnabled,
  selectedSport,
  selectedRegion,
  isReady,
  isMobile,
  isHeroEmbed,
  activeCluster,
  showWindOnMarkers,
  locale,
  warningsBySpot,
  onSpotSelect,
  setSheetSpot,
  closePopupAndSheet,
}: UseMapMarkersParams) {
  const [allowMarkers, setAllowMarkers] = useState(false);
  const didFitBoundsRef = useRef(false);
  const filterBoundsKeyRef = useRef('');

  // ── Markers effect ──
  useEffect(() => {
    if (!allowMarkers || !isReady || !mapInstanceRef.current || !clusterGroupRef.current || !markersGroupRef.current) return;
    if (!LRef.current) return;

    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    const mcg = clusterGroupRef.current;
    const lg = markersGroupRef.current;
    const cache = markersCacheRef.current;

    closePopupAndSheet();
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
    const chunkSize = isMobile ? MARKER_ADD_CHUNK_SIZE_MOBILE : MARKER_ADD_CHUNK_SIZE_LOCAL;
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
          if (includeSpotInViewportBounds(data.spot, selectedRegion ?? '')) bounds.extend([data.spot.lat, data.spot.lon]);
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
  }, [allowMarkers, visibleSpots, onlyOnEnabled, selectedSport, selectedRegion, isReady, activeCluster, showWindOnMarkers, locale, onSpotSelect, isMobile, isHeroEmbed, warningsBySpot, mapInstanceRef, LRef, clusterGroupRef, markersGroupRef, markersCacheRef]);

  // ── Allow markers after delay ──
  useEffect(() => {
    if (!isReady) { setAllowMarkers(false); return; }
    const delay = isMobile ? 280 : 0;
    const t = window.setTimeout(() => setAllowMarkers(true), delay);
    return () => window.clearTimeout(t);
  }, [isReady, isMobile]);

  return { allowMarkers, didFitBoundsRef, filterBoundsKeyRef };
}
