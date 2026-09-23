'use client';

/**
 * MapMarkersZone — compartimento «marcadores» do mapa (dono M4,
 * docs/design/MAP-ZONES.md): marcadores, clusters (opções do markercluster),
 * ícones, avisos por pin e pré-visualização/popup/sheet do spot. Estado e JSX
 * movidos do SpotMapInteractive sem alteração de comportamento.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type L from 'leaflet';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { strongestSpotWarning, warningBadgeLabel } from '@/lib/ipmaWarnings';
import { SEA_STATE_WARNING_TYPES } from '@/lib/ipmaWarnings';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { MapSpotData } from '../../mapSpotData';
import { includeSpotInViewportBounds } from '../../mapViewportBounds';
import { resolveExploreChrome } from '../../mapMarkers';
import { useMapMarkers } from '../hooks/useMapMarkers';
import MapSpotSheet, { type MapSpotSheetData } from '../../MapSpotSheet';
import { useMapUiActions, useMapUiData } from '../MapUiContext';

type MapHudProps = Omit<MapFullscreenHudProps, 'isPt' | 'visible'>;

// ─── Estado: marcadores/clusters, foco de spot, popup, fit do hero ───

interface UseMapMarkersZoneParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  /** Contentor do mapa — detecta o modo hero (`data-map-hero-teaser`). */
  mapRef: React.RefObject<HTMLDivElement | null>;
  clusterGroupRef: React.MutableRefObject<L.MarkerClusterGroup | null>;
  markersGroupRef: React.MutableRefObject<L.LayerGroup | null>;
  markersCacheRef: React.MutableRefObject<Map<string, L.Marker>>;
  onSpotSelectRef: React.MutableRefObject<((spotId: string) => void) | undefined>;
  visibleSpots: MapSpotData[];
  onlyOnEnabled: boolean;
  selectedSport: GridSportFilter;
  selectedRegion: string;
  isReady: boolean;
  clusterReady: boolean;
  isMobile: boolean;
  isHeroEmbed: boolean;
  isFullscreen: boolean;
  activeCluster: boolean;
  showWindOnMarkers: boolean;
  locale: string;
  isPt: boolean;
  hourScores: Map<string, number> | null;
  onSpotSelect?: (spotId: string) => void;
  onMarkerInteract: () => void;
  setSheetSpot: React.Dispatch<React.SetStateAction<MapSpotSheetData | null>>;
  /** Moldura do modo Explorar (painel recolhido/aberto) — descontada no fit. */
  mapHud: MapHudProps | undefined;
  panelCollapsed: boolean;
}

export function useMapMarkersZone({
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
}: UseMapMarkersZoneParams) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();

  // ── Warnings by spot ──
  const warningsData = useIpmaWarnings();
  const warningsBySpot = useMemo(() => {
    const map = new Map<string, MapMarkerWarning>();
    if (!warningsData) return map;
    for (const data of visibleSpots) {
      const w = strongestSpotWarning(warningsData, data.spot.id);
      if (w) map.set(data.spot.id, { level: w.level, label: warningBadgeLabel(w, isPt), seaState: SEA_STATE_WARNING_TYPES.has(w.type) });
    }
    return map;
  }, [warningsData, visibleSpots, isPt]);

  // ── Markers (extracted hook: cache, chunked insertion, cluster switching) ──
  const closePopupAndSheet = useCallback(() => {
    mapInstanceRef.current?.closePopup();
    setSheetSpot(null);
  }, [mapInstanceRef, setSheetSpot]);
  useMapMarkers({
    mapInstanceRef, LRef, clusterGroupRef, markersGroupRef, markersCacheRef,
    visibleSpots, onlyOnEnabled, selectedSport, selectedRegion, isReady, clusterReady,
    isMobile, isHeroEmbed, activeCluster, showWindOnMarkers, locale,
    warningsBySpot, hourScores, onSpotSelect, onMarkerInteract, setSheetSpot, closePopupAndSheet,
    exploreChrome: resolveExploreChrome(Boolean(mapHud) && isFullscreen, isMobile, panelCollapsed),
  });

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
  }, [isReady, mapInstanceRef, onSpotSelectRef]);

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
  }, [isHeroEmbed, isReady, visibleSpots, selectedRegion, isMobile, mapInstanceRef, LRef, mapRef]);

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

  // Toque numa linha: mobile abre o sheet de detalhe (mesmo do marcador),
  // desktop voa até ao marcador e abre o popup (desagrupa se preciso).
  const focusMapSpot = useCallback(
    (spotId: string, openDetail = true) => {
      const map = mapInstanceRef.current;
      const d = visibleSpots.find((x) => x.spot.id === spotId);
      if (!map || !d) return;
      const ll: [number, number] = [d.spot.lat, d.spot.lon];
      const zoom = Math.max(map.getZoom(), 9);
      if (reducedMotion) map.setView(ll, zoom);
      else map.flyTo(ll, zoom, { duration: 0.45 });
      if (!openDetail) return;
      if (isMobile) {
        setSheetSpot({ ...d, warning: warningsBySpot.get(d.spot.id) ?? null });
        return;
      }
      const openPopup = () => {
        const marker = markersCacheRef.current.get(d.spot.id);
        if (!marker) return;
        const mcg = clusterGroupRef.current;
        if (activeCluster && mcg) {
          mcg.zoomToShowLayer(marker, () => {
            if (!marker.isPopupOpen()) marker.openPopup();
          });
        } else if (!marker.isPopupOpen()) {
          marker.openPopup();
        }
      };
      if (reducedMotion) openPopup();
      else map.once('moveend', openPopup);
    },
    [visibleSpots, warningsBySpot, isMobile, reducedMotion, activeCluster,
      mapInstanceRef, markersCacheRef, clusterGroupRef, setSheetSpot],
  );

  return { focusMapSpot, closePopupAndSheet };
}

// ─── Vista: pré-visualização do spot (sheet mobile) — lê a selecção do
//     contexto partilhado ───

export function MapMarkersZone() {
  const { isMobile, sheetSpot, sport, locale } = useMapUiData();
  const { closeSpotSheet, selectSpot } = useMapUiActions();

  if (!isMobile) return null;
  return (
    <MapSpotSheet
      data={sheetSpot}
      selectedSport={sport}
      locale={locale}
      onClose={closeSpotSheet}
      onViewSpot={selectSpot}
    />
  );
}
