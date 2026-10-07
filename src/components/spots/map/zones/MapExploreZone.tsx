'use client';

/**
 * MapExploreZone — compartimento «explorar» do mapa (dono M3,
 * docs/design/MAP-ZONES.md): painel desktop (MapSpotPanel), sheet mobile
 * (MapExploreSheet), lista sincronizada com o viewport, filtros e aviso de
 * boias. Estado e JSX movidos do SpotMapInteractive sem alteração de
 * comportamento.
 */

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type L from 'leaflet';
import {
  HelpCircle, Layers, MapPin, Wind,
} from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { localizedSpotDisplayName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { DEFAULT_REGION, MAINLAND_REGION } from '@/lib/gridFilters';
import { includeSpotInViewportBounds } from '../../mapViewportBounds';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { MapSpotData } from '../../mapSpotData';
import { getBestScore } from '../../mapSpotData';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import type {
  ExploreSheetState,
  SheetToggleItem,
} from '../components/MapExploreSheet';
import type { MapListJump, MapSpotListRow } from '../components/MapSpotList';

type MapTranslation = ReturnType<typeof getTranslation>;
type MapHudProps = Omit<MapFullscreenHudProps, 'isPt' | 'visible'>;

/** Chips de território → valor do filtro de região (o mesmo do select).
 *  Os bounds de cada território vivem em `TERRITORY_BOUNDS`
 *  (mapViewportBounds) e são o fallback do enquadramento dos marcadores. */
const MAP_LIST_JUMP_REGION: Record<string, string> = {
  cont: MAINLAND_REGION,
  az: 'Açores',
  ma: 'Madeira',
};

// ─── Estado: sheet (3 estados), painel, altura aberta, lista e extras ───

interface UseMapExploreZoneParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  isReady: boolean;
  isFullscreen: boolean;
  mapHud: MapHudProps | undefined;
  visibleSpots: MapSpotData[];
  hourScores: Map<string, number> | null;
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  focusSpotId?: string;
  initialHoursEnabled: boolean;
  initialRadarEnabled: boolean;
  // Toggles de vista (estado partilhado do orquestrador)
  onlyOnEnabled: boolean;
  clusterEnabled: boolean;
  toggleCluster: () => void;
  windEnabled: boolean;
  toggleWind: () => void;
  openWindLegend: () => void;
  t: MapTranslation;
}

export function useMapExploreZone({
  mapInstanceRef,
  isReady,
  isFullscreen,
  mapHud,
  visibleSpots,
  hourScores,
  selectedSport,
  selectedRegion,
  locale,
  focusSpotId,
  initialHoursEnabled,
  initialRadarEnabled,
  onlyOnEnabled,
  clusterEnabled,
  toggleCluster,
  windEnabled,
  toggleWind,
  openWindLegend,
  t,
}: UseMapExploreZoneParams) {
  // Sheet explorar (mobile, 3 estados) e painel desktop — substituem o HUD.
  // ?spot= abre na lista; ?hours=/?radar= abrem no estado «half» onde vive o
  // trilho temporal (mesma posição do HUD antigo).
  const [exploreSheetState, setExploreSheetState] = useState<ExploreSheetState>(
    focusSpotId ? 'open' : initialHoursEnabled || initialRadarEnabled ? 'half' : 'peek',
  );
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Altura «open» = 88% do viewport (maquete: `open = round(innerHeight *
  // 0.88)`); o meio fica a 68% desta — ≈60% do ecrã, como os 56% da maquete.
  const [openHeight, setOpenHeight] = useState(620);

  // UX v3 (M4): o «←» do sheet de spot volta à lista — M6: a acção chega
  // pelo MapUiContext (`openExploreSheet`, implementada em
  // SpotMapInteractive sobre este `setExploreSheetState`); o evento
  // `ventu:open-explore-sheet` deixou de existir.

  useEffect(() => {
    const sync = () => setOpenHeight(Math.round(window.innerHeight * 0.88));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // Nome = MODO (constante) e estado = aria-pressed — nunca o contrário:
  // com o mapa AGRUPADO o leitor anunciava «Mostrar todos, premido», o nome
  // a contradizer o estado. O chip carrega o MESMO estado que o espelho
  // `data-map-cluster` do shell (antes eram inversos).
  const clusterLabel = t.map.clusterSpots;
  const onlyOnLabel = onlyOnEnabled ? t.map.onlyOnOff : t.map.onlyOn;
  const onlyOnHint = t.map.onlyOnHint;
  const hudSpotCount = onlyOnEnabled ? visibleSpots.length : (mapHud?.spotCount ?? visibleSpots.length);

  const sheetExtras: SheetToggleItem[] = useMemo(() => [
    {
      key: 'cluster',
      label: clusterLabel,
      icon: clusterEnabled
        ? <MapPin className="w-4 h-4" aria-hidden />
        : <Layers className="w-4 h-4" aria-hidden />,
      pressed: clusterEnabled,
      onToggle: toggleCluster,
    },
    {
      key: 'wind',
      label: windEnabled ? t.map.hideWind : t.map.showWind,
      icon: <Wind className="w-4 h-4" aria-hidden />,
      pressed: windEnabled,
      onToggle: toggleWind,
    },
    {
      key: 'windhelp',
      label: t.map.windRingLegend.help,
      icon: <HelpCircle className="w-4 h-4" aria-hidden />,
      onToggle: openWindLegend,
    },
  ], [
    clusterLabel, clusterEnabled, toggleCluster,
    windEnabled, toggleWind, openWindLegend,
    t.map.hideWind, t.map.showWind, t.map.windRingLegend.help,
  ]);

  // ── Lista sincronizada — mesma fonte dos marcadores (getBestScore com o
  //    override da hora activa), restrita aos bounds do viewport e ordenada
  //    por score. Alimenta o peek «Melhor agora», o sheet aberto e o painel. ──
  const buildRows = useCallback((): MapSpotListRow[] => {
    const bounds = mapInstanceRef.current?.getBounds();
    // Mesma fonte de enquadramento dos marcadores (D3: includeSpotInViewportBounds)
    // — sem ela, uma row de ilha dentro do viewport (o fit móvel a oeste chega
    // a enquadrar a Madeira) ficava sem marcador e quebrava o contrato
    // «Melhor agora = topo da lista = maior marcador na vista».
    const inView = visibleSpots.filter(
      (d) =>
        includeSpotInViewportBounds(d.spot, selectedRegion ?? DEFAULT_REGION) &&
        (!bounds || bounds.contains([d.spot.lat, d.spot.lon])),
    );
    return inView
      .map((d) => {
        return {
          spotId: d.spot.id,
          name: localizedSpotDisplayName(d.spot, locale),
          region: localizedSpotRegion(d.spot, locale),
          score: getBestScore(d, selectedSport, hourScores?.get(d.spot.id)),
          factors: getSpotScoreFactors({
            spot: d.spot,
            conditions: d.conditions,
            allScores: d.allScores,
            sport: selectedSport,
            locale,
          }),
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [visibleSpots, hourScores, selectedSport, selectedRegion, locale, mapInstanceRef]);

  const [viewRows, setViewRows] = useState<MapSpotListRow[]>([]);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isReady || !map || !isFullscreen || !mapHud) {
      setViewRows([]);
      return;
    }
    // CORRECCOES-24SET (M5): o re-render da lista no moveend media ~180 ms
    // num só task a 4× CPU e furava o gate «pan ≤ 50 ms» mesmo com o campo
    // de vento suspenso (a M4 já o apontava como residual). A actualização
    // da lista não é urgente — startTransition deixa o React fatiar o render
    // sem bloquear o gesto; o conteúdo e a ordem mantêm-se.
    // M7-F (TBT): a PRIMEIRA montagem também não é precisa para o primeiro
    // frame — corre em requestIdleCallback (fallback setTimeout); os
    // recomputes por moveend/zoomend ficam directos.
    const compute = () => startTransition(() => setViewRows(buildRows()));
    const ric = window.requestIdleCallback;
    let idleId: number | undefined;
    let timerId: number | undefined;
    if (typeof ric === 'function') idleId = ric(compute, { timeout: 900 });
    else timerId = window.setTimeout(compute, 60);
    map.on('moveend', compute);
    map.on('zoomend', compute);
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
      map.off('moveend', compute);
      map.off('zoomend', compute);
    };
  }, [isReady, isFullscreen, mapHud, buildRows, mapInstanceRef]);

  // Chips de território (Continente / Açores / Madeira) — toggles do MESMO
  // filtro de região do select: premir filtra e enquadra (o efeito dos
  // marcadores re-enquadra na mudança de filtro, sem animação — respeita
  // reduced-motion); premir outra vez limpa. Antes só faziam flyToBounds com
  // a região em «Todos», e como os marcadores/lista excluem as ilhas fora de
  // um filtro de ilha, «Surf + Açores» mostrava 0 spots.
  const onRegionChange = mapHud?.onRegionChange;
  const jumpTo = useCallback(
    (id: string) => {
      const region = MAP_LIST_JUMP_REGION[id];
      if (!region || !onRegionChange) return;
      onRegionChange(selectedRegion === region ? DEFAULT_REGION : region);
    },
    [onRegionChange, selectedRegion],
  );
  // Só os territórios que o host aceita como região (o /mapa junta
  // «Continente»; outras superfícies com MACRO_REGIONS ficam com as ilhas).
  const hudRegions = mapHud?.regions;
  const jumps: MapListJump[] = useMemo(
    () =>
      [
        { id: 'cont', label: t.mapUiLayers.areaContinent, pressed: selectedRegion === MAINLAND_REGION },
        { id: 'az', label: t.mapUiLayers.areaAzores, pressed: selectedRegion === 'Açores' },
        { id: 'ma', label: t.mapUiLayers.areaMadeira, pressed: selectedRegion === 'Madeira' },
      ].filter((j) => !hudRegions || hudRegions.includes(MAP_LIST_JUMP_REGION[j.id])),
    [t.mapUiLayers.areaContinent, t.mapUiLayers.areaAzores, t.mapUiLayers.areaMadeira, selectedRegion, hudRegions],
  );

  return {
    exploreSheetState, setExploreSheetState,
    panelCollapsed, setPanelCollapsed,
    openHeight, viewRows, sheetExtras,
    clusterLabel, onlyOnLabel, onlyOnHint, hudSpotCount,
    clusterEnabled, toggleCluster,
    jumpTo, jumps,
  };
}

export type MapExploreState = ReturnType<typeof useMapExploreZone>;

// A vista (painel/sheet) vive em MapExploreZoneView.tsx — chunk dinâmico
// (M7-F): a árvore de lista/filtros avalia-se fora do chunk principal.
