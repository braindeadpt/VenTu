import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import type { MapSpotData } from '../../mapSpotData';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapSpotSheetData } from '../../MapSpotSheet';
import {
  applyExploreMapFit,
  buildMarkerCacheKey,
  createSpotMarker,
  exploreViewBoundsFromSpots,
  runChunked,
  MARKER_ADD_CHUNK_SIZE,
  MARKER_ADD_CHUNK_SIZE_MOBILE,
  MARKER_CHUNK_YIELD_MS_MOBILE,
  type ExploreChrome,
} from '../../mapMarkers';

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
  clusterReady: boolean;
  isMobile: boolean;
  isHeroEmbed: boolean;
  /** Moldura do modo Explorar por cima do mapa (sheet/painel) — o re-enquadre desconta-a. */
  exploreChrome?: ExploreChrome;
  activeCluster: boolean;
  showWindOnMarkers: boolean;
  locale: string;
  warningsBySpot: Map<string, MapMarkerWarning>;
  /** Score at the HUD hour (48 h mode). Missing ids keep live conditions. */
  hourScores?: Map<string, number> | null;
  onSpotSelect?: (spotId: string) => void;
  onMarkerInteract?: () => void;
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
  clusterReady,
  isMobile,
  isHeroEmbed,
  exploreChrome = 'none',
  activeCluster,
  showWindOnMarkers,
  locale,
  warningsBySpot,
  hourScores = null,
  onSpotSelect,
  onMarkerInteract,
  setSheetSpot,
  closePopupAndSheet,
}: UseMapMarkersParams) {
  const [allowMarkers, setAllowMarkers] = useState(false);
  // Ref e não dependência: recolher o painel não deve re-correr o efeito dos
  // marcadores — só o próximo re-enquadre (mudança de filtro) usa a moldura.
  // Sincronizado num efeito declarado ANTES do dos marcadores, para já ter o
  // valor novo quando esse efeito corre.
  const exploreChromeRef = useRef<ExploreChrome>(exploreChrome);
  useEffect(() => {
    exploreChromeRef.current = exploreChrome;
  }, [exploreChrome]);
  const didFitBoundsRef = useRef(false);
  const filterBoundsKeyRef = useRef('');
  // Nunca re-enquadrar depois de o utilizador navegar: drag/pinch/wheel marcam
  // navegação própria; os fits programáticos passam pela flag e não contam
  // (animate:false nem chega a disparar zoomstart, a flag é redundância segura).
  const userNavigatedRef = useRef(false);
  const programmaticViewRef = useRef(false);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isReady || !map) return;
    const markUserNav = () => {
      if (!programmaticViewRef.current) userNavigatedRef.current = true;
    };
    map.on('dragstart', markUserNav);
    map.on('zoomstart', markUserNav);
    return () => {
      map.off('dragstart', markUserNav);
      map.off('zoomstart', markUserNav);
    };
  }, [isReady, mapInstanceRef]);

  // ── Markers effect ──
  useEffect(() => {
    if (!allowMarkers || !isReady || !clusterReady || !mapInstanceRef.current || !clusterGroupRef.current || !markersGroupRef.current) return;
    if (!LRef.current) return;

    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    const mcg = clusterGroupRef.current;
    const lg = markersGroupRef.current;
    const cache = markersCacheRef.current;

    // Chave de filtro SEM o nº de spots — um refresh de dados que altere o
    // count não re-enquadra por cima da vista escolhida pelo utilizador.
    const boundsKey = `${onlyOnEnabled}:${selectedSport}:${selectedRegion}`;
    if (filterBoundsKeyRef.current !== boundsKey) {
      filterBoundsKeyRef.current = boundsKey;
      didFitBoundsRef.current = false;
      userNavigatedRef.current = false;
      // Mudança deliberada de filtro — fecha o que estiver aberto.
      closePopupAndSheet();
    }

    if (activeCluster) {
      if (map.hasLayer(lg)) map.removeLayer(lg);
      if (!map.hasLayer(mcg)) map.addLayer(mcg);
    } else {
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      if (!map.hasLayer(lg)) map.addLayer(lg);
    }

    // Enquadramento calculado das coords logo aqui — imediato, sem esperar
    // pelos marcadores (o arranque já nasce enquadrado via useMapCore; aqui
    // fica o re-enquadre por mudança de filtro, uma vez por chave e nunca
    // depois de o utilizador navegar).
    if (!didFitBoundsRef.current && !userNavigatedRef.current) {
      const boundsArr = exploreViewBoundsFromSpots(visibleSpots, selectedRegion ?? '');
      if (boundsArr) {
        didFitBoundsRef.current = true;
        map.invalidateSize({ animate: false });
        programmaticViewRef.current = true;
        try {
          if (isHeroEmbed) {
            const leftPad = isMobile ? 20 : 300;
            map.fitBounds(Leaflet.latLngBounds(boundsArr), {
              paddingTopLeft: Leaflet.point(leftPad, 48),
              paddingBottomRight: Leaflet.point(40, 96),
              maxZoom: isMobile ? 8 : 10,
              animate: false,
            });
          } else {
            applyExploreMapFit(Leaflet, map, boundsArr, isMobile, exploreChromeRef.current);
          }
        } finally {
          programmaticViewRef.current = false;
        }
      }
    }

    const nextIds = new Set(visibleSpots.map((d) => d.spot.id));

    // O sheet só fecha quando o spot aberto deixa de estar visível (mudança
    // de filtro já fechou acima). Um refresh com os mesmos spots não o derruba.
    setSheetSpot((cur) => (cur && !nextIds.has(cur.spot.id) ? null : cur));

    // Cache diff — só saem os marcadores cujo spot deixou de estar visível.
    // A remoção é via os grupos: `marker.remove()` sozinho não chega — o
    // mapa não regista os filhos de um LayerGroup em map._layers.
    for (const [id, marker] of cache) {
      if (!nextIds.has(id)) {
        mcg.removeLayer(marker);
        lg.removeLayer(marker);
        marker.remove();
        cache.delete(id);
      }
    }

    if (visibleSpots.length === 0) return;

    // No hero o sheet (85dvh) fica cortado pela caixa do hero — o popup do
    // Leaflet cabe lá dentro e o autoPan mantém-no visível sem drag.
    const useMobileSheet = isMobile && !isHeroEmbed;
    const chunkSize = isMobile ? MARKER_ADD_CHUNK_SIZE_MOBILE : MARKER_ADD_CHUNK_SIZE_LOCAL;
    const yieldMs = isMobile ? MARKER_CHUNK_YIELD_MS_MOBILE : 0;

    // O marcador com popup aberto pode ter de ser recriado (score/vento novos)
    // ou mudar de grupo — remover o marcador fecha o popup, por isso reabre-se
    // na nova instância assim que ela volta ao mapa.
    let reopenSpotId: string | null = null;
    for (const [id, marker] of cache) {
      if (marker.isPopupOpen()) { reopenSpotId = id; break; }
    }

    const markerChunkCancelRef = { current: false };
    runChunked(
      visibleSpots,
      (batch) => {
        const toCluster: L.Marker[] = [];
        const toPlain: L.Marker[] = [];
        for (const data of batch) {
          const warning = warningsBySpot.get(data.spot.id) ?? null;
          const scoreOverride = hourScores?.get(data.spot.id);
          const cacheKey = buildMarkerCacheKey(data, selectedSport, showWindOnMarkers, locale, useMobileSheet, warning?.level ?? null, scoreOverride);
          let marker = cache.get(data.spot.id);
          const meta = marker as (L.Marker & { ventuKey?: string }) | undefined;
          if (!marker || meta?.ventuKey !== cacheKey) {
            // Conteúdo mudou — recria-se só esse marcador (não a camada toda).
            if (marker) {
              mcg.removeLayer(marker);
              lg.removeLayer(marker);
              marker.remove();
              cache.delete(data.spot.id);
            }
            marker = createSpotMarker(Leaflet, data, selectedSport, locale, showWindOnMarkers, {
              useMobileSheet,
              onMobileTap: (d) => setSheetSpot({ ...d, warning: warningsBySpot.get(d.spot.id) ?? null }),
              onSpotSelect,
              onMarkerInteract,
              warning,
              scoreOverride,
            });
            (marker as L.Marker & { ventuKey?: string }).ventuKey = cacheKey;
            cache.set(data.spot.id, marker);
          }
          // Marcadores intactos ficam onde estão — só se move quem está no
          // grupo errado (toggle de cluster) e só se inserem os novos.
          if (activeCluster) {
            if (lg.hasLayer(marker)) lg.removeLayer(marker);
            if (!mcg.hasLayer(marker)) toCluster.push(marker);
          } else {
            if (mcg.hasLayer(marker)) mcg.removeLayer(marker);
            if (!lg.hasLayer(marker)) toPlain.push(marker);
          }
        }
        if (toCluster.length > 0) mcg.addLayers(toCluster);
        if (toPlain.length > 0) toPlain.forEach((m) => lg.addLayer(m));
        if (reopenSpotId != null) {
          const m = cache.get(reopenSpotId);
          if (m && (mcg.hasLayer(m) || lg.hasLayer(m)) && !m.isPopupOpen()) {
            try { m.openPopup(); } catch { /* noop */ }
            reopenSpotId = null;
          } else if (m && m.isPopupOpen()) {
            reopenSpotId = null;
          }
        }
      },
      markerChunkCancelRef,
      undefined,
      chunkSize,
      yieldMs,
    );

    return () => { markerChunkCancelRef.current = true; };
  }, [allowMarkers, visibleSpots, onlyOnEnabled, selectedSport, selectedRegion, isReady, clusterReady, activeCluster, showWindOnMarkers, locale, onSpotSelect, onMarkerInteract, isMobile, isHeroEmbed, warningsBySpot, hourScores, mapInstanceRef, LRef, clusterGroupRef, markersGroupRef, markersCacheRef, setSheetSpot, closePopupAndSheet]);

  // ── Allow markers after delay ──
  useEffect(() => {
    if (!isReady) { setAllowMarkers(false); return; }
    const delay = isMobile ? 280 : 0;
    const t = window.setTimeout(() => setAllowMarkers(true), delay);
    return () => window.clearTimeout(t);
  }, [isReady, isMobile]);

  return { allowMarkers, didFitBoundsRef, filterBoundsKeyRef };
}
