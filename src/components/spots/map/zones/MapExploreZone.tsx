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
import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { DEFAULT_REGION } from '@/lib/gridFilters';
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

/** Bounds dos chips «Saltar para» — os mesmos JUMPS da maquete aprovada. */
const MAP_LIST_JUMP_BOUNDS: Record<string, { s: number; n: number; w: number; e: number }> = {
  cont: { s: 36.9, n: 42.2, w: -9.6, e: -7.3 },
  az: { s: 36.9, n: 39.8, w: -31.4, e: -24.9 },
  ma: { s: 32.55, n: 33.15, w: -17.35, e: -16.25 },
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

  const clusterLabel = clusterEnabled ? t.map.showAllSpots : t.map.clusterSpots;
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
      pressed: !clusterEnabled,
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
          name: localizedSpotName(d.spot, locale),
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

  // Chips «Saltar para» no cabeçalho da lista — bounds da maquete
  // (JUMPS): Continente / Açores / Madeira. §11: flyTo da lista = 600 ms
  // (easeOutCubic — o easing interno do flyToBounds do Leaflet).
  const jumpTo = useCallback(
    (id: string) => {
      const map = mapInstanceRef.current;
      const b = MAP_LIST_JUMP_BOUNDS[id];
      if (!map || !b) return;
      map.flyToBounds(
        [
          [b.s, b.w],
          [b.n, b.e],
        ],
        { duration: 0.6 },
      );
    },
    [mapInstanceRef],
  );
  const jumps: MapListJump[] = useMemo(
    () => [
      { id: 'cont', label: t.mapUiExplore.continent },
      { id: 'az', label: 'Açores' },
      { id: 'ma', label: 'Madeira' },
    ],
    [t.mapUiExplore.continent],
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
