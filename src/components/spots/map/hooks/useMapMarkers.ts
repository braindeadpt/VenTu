import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import type { MapSpotData } from '../../mapSpotData';
import { getBestScore } from '../../mapSpotData';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapSpotSheetData } from '../../MapSpotSheet';
import { includeSpotInViewportBounds } from '../../mapViewportBounds';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import { localizedSpotName } from '@/lib/localizedSpotText';
import {
  applyExploreMapFit,
  applyV3LayoutIcon,
  buildMarkerCacheKey,
  createSpotMarker,
  createV3SpotMarker,
  exploreViewBoundsFromSpots,
  markerCollisionRadiusPx,
  planMarkerLayout,
  runChunked,
  v3LodKey,
  MARKER_ADD_CHUNK_SIZE,
  MARKER_ADD_CHUNK_SIZE_MOBILE,
  MARKER_CHUNK_YIELD_MS_MOBILE,
  type ExploreChrome,
  type MarkerLayoutEntry,
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
  /** prefers-reduced-motion — entrada de marcadores/flyTo sem animação. */
  reducedMotion?: boolean;
  /** aria-label do badge «+N» com `{n}` para a contagem (i18n da zona). */
  moreAriaTemplate?: string;
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
  reducedMotion = false,
  moreAriaTemplate,
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

  // Superfície de exploração (/mapa em ecrã inteiro + embeds expandidos) —
  // UX v3: LOD por colisão substitui o markercluster. Herdado do chrome:
  // 'none' = embed sem moldura (mantém markercluster/popup clássicos).
  const exploreMode = exploreChrome !== 'none';

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
      const isFirstKey = filterBoundsKeyRef.current === '';
      filterBoundsKeyRef.current = boundsKey;
      didFitBoundsRef.current = false;
      userNavigatedRef.current = false;
      // Mudança deliberada de filtro — fecha o que estiver aberto. A PRIMEIRA
      // chave não é uma mudança: o deep link ?spot= abre a pré-visualização
      // antes deste efeito ter clusterReady, e fechá-la aqui matava o cartão
      // (regressão apanhada por map-v3-markers «?spot= abre a pré-visualização»).
      if (!isFirstKey) closePopupAndSheet();
    }

    if (exploreMode) {
      // UX v3: todos os marcadores vivem no layer group — o markercluster
      // fica fora do mapa (mantém-se criado para o hero e embeds).
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      mcg.clearLayers();
      if (!map.hasLayer(lg)) map.addLayer(lg);
    } else if (activeCluster) {
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

    // Marcadores só para os spots DENTRO dos bounds enquadráveis — a mesma
    // fonte do fitBounds. Sem isto, Açores/Madeira montavam um cluster
    // fantasma para fora do enquadramento continental (agrupamento invisível
    // na margem do mapa que se podia clicar sem traduzir nada no ecrã).
    const markerSpots = visibleSpots.filter((d) =>
      includeSpotInViewportBounds(d.spot, selectedRegion ?? DEFAULT_REGION),
    );
    const nextIds = new Set(markerSpots.map((d) => d.spot.id));

    // O sheet só fecha quando o spot aberto deixa de estar visível (mudança
    // de filtro já fechou acima). Um refresh com os mesmos spots não o derruba
    // — e no modo v3 o conteúdo é refrescado em silêncio (o cartão/sheet lê
    // os dados novos sem fechar).
    setSheetSpot((cur) => {
      if (!cur) return cur;
      const fresh = markerSpots.find((d) => d.spot.id === cur.spot.id);
      if (!fresh) return null;
      if (exploreMode) {
        return { ...fresh, warning: warningsBySpot.get(fresh.spot.id) ?? null };
      }
      return cur;
    });

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

    if (markerSpots.length === 0) return;

    // ── UX v3: decisão de colocação por colisão (função pura — recluster()
    // da maquete). Computada das coordenadas projectadas no zoom actual;
    // re-corre em zoomend via applyLayout(). ──
    const byId = new Map(markerSpots.map((d) => [d.spot.id, d]));
    const computeLayout = (): Map<string, MarkerLayoutEntry> => {
      const items = markerSpots.map((d) => {
        const p = map.latLngToContainerPoint([d.spot.lat, d.spot.lon]);
        return {
          id: d.spot.id,
          x: p.x,
          y: p.y,
          score: getBestScore(d, selectedSport, hourScores?.get(d.spot.id)),
        };
      });
      const radius = markerCollisionRadiusPx(map.getZoom(), isMobile);
      return new Map(
        planMarkerLayout(items, radius, !activeCluster).map((e) => [e.id, e]),
      );
    };
    const layoutById = exploreMode ? computeLayout() : null;
    const showWindTick = exploreMode && showWindOnMarkers && map.getZoom() >= 8.5;

    const markerChunkCancelRef = { current: false };

    if (exploreMode && layoutById) {
      const container = map.getContainer();
      const openPreview = (d: MapSpotData) =>
        setSheetSpot({ ...d, warning: warningsBySpot.get(d.spot.id) ?? null });

      // Tooltip do nome no hover — só ponteiros com hover real (maquete).
      const tip = document.createElement('div');
      tip.setAttribute('role', 'tooltip');
      tip.setAttribute('aria-hidden', 'true');
      tip.style.cssText =
        'position:absolute;left:0;top:0;pointer-events:none;z-index:1000;' +
        'background:rgb(var(--bg-elevated));color:rgb(var(--fg));' +
        'border:1px solid rgb(var(--divider-rgb) / 0.25);border-radius:8px;' +
        'padding:4px 8px;font:500 12px/1.3 var(--font-geist-sans,system-ui,sans-serif);' +
        'white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.28);' +
        'opacity:0;transition:opacity .12s ease-out';
      const hoverCapable =
        !isMobile && window.matchMedia?.('(hover: hover)').matches === true;
      if (hoverCapable) container.appendChild(tip);
      const showTip = (spotId: string | null) => {
        if (!hoverCapable) return;
        const d = spotId ? byId.get(spotId) : undefined;
        if (!d) {
          tip.style.opacity = '0';
          return;
        }
        const p = map.latLngToContainerPoint([d.spot.lat, d.spot.lon]);
        tip.textContent = localizedSpotName(d.spot, locale);
        tip.style.transform = `translate(${Math.round(p.x + 22)}px, ${Math.round(p.y - 12)}px)`;
        tip.style.opacity = '1';
      };

      // Badge «+N»: zoomToBounds animado (400 ms, maxZoom 12 — maquete).
      const onContainerClick = (e: MouseEvent) => {
        const el = (e.target as HTMLElement | null)?.closest?.('.v3more') as
          | HTMLElement
          | null;
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        onMarkerInteract?.();
        const ids = (el.dataset.v3members ?? '').split(',').filter(Boolean);
        const bounds = Leaflet.latLngBounds([]);
        for (const id of ids) {
          const d = byId.get(id);
          if (d) bounds.extend([d.spot.lat, d.spot.lon]);
        }
        if (!bounds.isValid()) return;
        programmaticViewRef.current = true;
        try {
          if (reducedMotion) {
            map.fitBounds(bounds.pad(0.08), { maxZoom: 12, animate: false });
          } else {
            map.flyToBounds(bounds.pad(0.08), {
              maxZoom: 12,
              duration: 0.4,
              padding: Leaflet.point(28, 28),
            });
          }
        } finally {
          programmaticViewRef.current = false;
        }
      };
      container.addEventListener('click', onContainerClick, true);

      // Clique no oceano desselecciona (maquete: select(null)).
      const onMapClick = () => setSheetSpot(null);
      map.on('click', onMapClick);

      // Re-corre a decisão ao assentar o zoom (o raio muda aos 8.5 e as
      // distâncias em px mudam em qualquer zoom). A chave inclui o estado do
      // tique de vento: cruzar o 8.5 sem mudar de papel tem de reconstruir o
      // ícone na mesma (senão o tique nunca aparecia/desaparecia).
      const applyLayout = () => {
        const tickOn = showWindOnMarkers && map.getZoom() >= 8.5;
        const next = computeLayout();
        for (const [id, marker] of cache) {
          const d = byId.get(id);
          const entry = next.get(id);
          if (!d || !entry) continue;
          const key = `${v3LodKey(entry)}|${tickOn ? 'w' : '-'}`;
          const meta = marker as L.Marker & { ventuLod?: string };
          if (meta.ventuLod === key) continue;
          meta.ventuLod = key;
          applyV3LayoutIcon(Leaflet, marker, d, entry, {
            selectedSport,
            showWindTick: tickOn,
            moreAriaTemplate,
            scoreOverride: hourScores?.get(id),
          });
        }
      };
      map.on('zoomend', applyLayout);

      const chunkSizeV3 = isMobile ? MARKER_ADD_CHUNK_SIZE_MOBILE : MARKER_ADD_CHUNK_SIZE_LOCAL;
      const yieldMsV3 = isMobile ? MARKER_CHUNK_YIELD_MS_MOBILE : 0;
      runChunked(
        markerSpots,
        (batch) => {
          for (const data of batch) {
            const entry = layoutById.get(data.spot.id) ?? {
              id: data.spot.id,
              kind: 'full' as const,
              memberIds: [data.spot.id],
            };
            const scoreOverride = hourScores?.get(data.spot.id);
            const cacheKey = buildMarkerCacheKey(
              data,
              selectedSport,
              showWindOnMarkers,
              locale,
              false,
              warningsBySpot.get(data.spot.id)?.level ?? null,
              scoreOverride,
            );
            let marker = cache.get(data.spot.id);
            const meta = marker as (L.Marker & { ventuKey?: string; ventuLod?: string }) | undefined;
            if (!marker || meta?.ventuKey !== cacheKey) {
              if (marker) {
                lg.removeLayer(marker);
                marker.remove();
                cache.delete(data.spot.id);
              }
              marker = createV3SpotMarker(Leaflet, data, entry, {
                selectedSport,
                locale,
                showWindTick,
                reducedMotion,
                onOpen: openPreview,
                onMarkerInteract,
                onHover: showTip,
                moreAriaTemplate,
                scoreOverride,
              });
              (marker as L.Marker & { ventuKey?: string }).ventuKey = cacheKey;
              (marker as L.Marker & { ventuLod?: string }).ventuLod =
                `${v3LodKey(entry)}|${showWindTick ? 'w' : '-'}`;
              cache.set(data.spot.id, marker);
            } else {
              // Marcador intacto: só muda de papel se o LOD novo disser.
              const key = `${v3LodKey(entry)}|${showWindTick ? 'w' : '-'}`;
              if (meta!.ventuLod !== key) {
                meta!.ventuLod = key;
                applyV3LayoutIcon(Leaflet, marker, data, entry, {
                  selectedSport,
                  showWindTick,
                  moreAriaTemplate,
                  scoreOverride,
                });
              }
            }
            if (!lg.hasLayer(marker)) lg.addLayer(marker);
          }
        },
        markerChunkCancelRef,
        undefined,
        chunkSizeV3,
        yieldMsV3,
      );

      return () => {
        markerChunkCancelRef.current = true;
        map.off('click', onMapClick);
        map.off('zoomend', applyLayout);
        container.removeEventListener('click', onContainerClick, true);
        tip.remove();
      };
    }

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

    runChunked(
      markerSpots,
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
  }, [allowMarkers, visibleSpots, onlyOnEnabled, selectedSport, selectedRegion, isReady, clusterReady, activeCluster, showWindOnMarkers, locale, onSpotSelect, onMarkerInteract, isMobile, isHeroEmbed, warningsBySpot, hourScores, mapInstanceRef, LRef, clusterGroupRef, markersGroupRef, markersCacheRef, setSheetSpot, closePopupAndSheet, exploreMode, reducedMotion, moreAriaTemplate]);

  // ── Allow markers after delay ──
  useEffect(() => {
    if (!isReady) { setAllowMarkers(false); return; }
    const delay = isMobile ? 280 : 0;
    const t = window.setTimeout(() => setAllowMarkers(true), delay);
    return () => window.clearTimeout(t);
  }, [isReady, isMobile]);

  return { allowMarkers, didFitBoundsRef, filterBoundsKeyRef };
}
