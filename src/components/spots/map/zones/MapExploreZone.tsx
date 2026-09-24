'use client';

/**
 * MapExploreZone — compartimento «explorar» do mapa (dono M3,
 * docs/design/MAP-ZONES.md): painel desktop (MapSpotPanel), sheet mobile
 * (MapExploreSheet), lista sincronizada com o viewport, filtros e aviso de
 * boias. Estado e JSX movidos do SpotMapInteractive sem alteração de
 * comportamento.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type L from 'leaflet';
import {
  HelpCircle, Layers, MapPin, Wind,
} from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import { mapHoursClock } from '@/lib/mapHours';
import { includeSpotInViewportBounds } from '../../mapViewportBounds';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { MapSpotData } from '../../mapSpotData';
import { getBestScore } from '../../mapSpotData';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import type { BasemapMode } from '../../MapLayerToggle';
import MapLegend from '../../MapLegend';
import BuoyLayerChip from '../../BuoyLayerChip';
import MapExploreSheet, {
  type ExploreSheetState,
  type SheetToggleItem,
} from '../components/MapExploreSheet';
import MapSpotPanel from '../components/MapSpotPanel';
import type { MapListJump, MapSpotListRow } from '../components/MapSpotList';
import type { MapLayersMenuItem } from '../components/MapLayersMenu';
import type { MapLayersFields } from './MapLayersZone';
import { VENTU_OPEN_EXPLORE_SHEET } from '../../mapMarkers';
import { useMapUiActions, useMapUiData } from '../MapUiContext';

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

  // UX v3 (M4): o «←» do sheet de spot volta à lista — o pedido chega por
  // evento partilhado (`VENTU_OPEN_EXPLORE_SHEET`, declarado em
  // mapMarkers.ts) porque o estado do sheet não está no contexto. Bloco
  // aditivo mínimo — registado para a revisão da M6.
  useEffect(() => {
    const open = () => setExploreSheetState('open');
    window.addEventListener(VENTU_OPEN_EXPLORE_SHEET, open);
    return () => window.removeEventListener(VENTU_OPEN_EXPLORE_SHEET, open);
  }, []);

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
    const compute = () => setViewRows(buildRows());
    compute();
    map.on('moveend', compute);
    map.on('zoomend', compute);
    return () => {
      map.off('moveend', compute);
      map.off('zoomend', compute);
    };
  }, [isReady, isFullscreen, mapHud, buildRows, mapInstanceRef]);

  // Chips «Saltar para» no cabeçalho da lista — bounds da maquete
  // (JUMPS): Continente / Açores / Madeira, flyToBounds de 700 ms.
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
        { duration: 0.7 },
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

// ─── Vista: painel desktop + sheet mobile ───

interface MapExploreZoneProps {
  mapHud: MapHudProps | undefined;
  isFullscreen: boolean;
  isMobile: boolean;
  state: MapExploreState;
  // Itens de camadas (dono M5 — chegam montados) e props da legenda embutida
  sheetLayers: MapLayersMenuItem[];
  legendLayerProps: MapLayersFields['legendLayerProps'];
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  exitFullscreenLabel: string;
  onExitFullscreen: () => void;
  onlyOnEnabled: boolean;
  onToggleOnlyOn: () => void;
  /** Trilho temporal partilhado (montado pelo cromo). */
  timeTrack: React.ReactNode;
  attributionHtml: string;
}

export function MapExploreZone({
  mapHud,
  isFullscreen,
  isMobile,
  state,
  sheetLayers,
  legendLayerProps,
  basemapMode,
  onBasemapChange,
  exitFullscreenLabel,
  onExitFullscreen,
  onlyOnEnabled,
  onToggleOnlyOn,
  timeTrack,
  attributionHtml,
}: MapExploreZoneProps) {
  const { isPt, locale, focusSpotId, hoursLive, hoursTimes, hoursFrame } = useMapUiData();
  const { focusSpot } = useMapUiActions();
  const t = getTranslation(locale);
  const {
    exploreSheetState, setExploreSheetState,
    panelCollapsed, setPanelCollapsed,
    openHeight, viewRows, sheetExtras,
    onlyOnHint, hudSpotCount,
    clusterEnabled, toggleCluster,
    jumpTo, jumps,
  } = state;

  // Hora activa do trilho das 48 h — alimenta o kicker «Melhor 17h» do peek
  // e a nota «Ordenado por score às 17h · métricas de agora» da lista.
  const hourClock = hoursLive && hoursTimes[hoursFrame]
    ? mapHoursClock(hoursTimes[hoursFrame])
    : null;
  const noteLabel = hourClock
    ? t.mapUiExplore.sortedHintAt.replace('{time}', hourClock)
    : t.mapUiExplore.sortedHintNow;
  const bestLabel = hourClock
    ? t.mapUiExplore.bestAt.replace('{time}', hourClock)
    : t.spotsMap.bestNow;

  if (!mapHud || !isFullscreen) return null;

  return (
    <>
      {/* Painel desktop — lista sincronizada + filtros + «Só a bombar»
          (a única casa do toggle no fullscreen; saiu da toolbar). */}
      {!isMobile && (
        <MapSpotPanel
          {...mapHud}
          locale={locale}
          isPt={isPt}
          spotCount={hudSpotCount}
          rows={viewRows}
          focusSpotId={focusSpotId}
          onSelectRow={(row) => focusSpot(row.spotId)}
          collapsed={panelCollapsed}
          onCollapsedChange={setPanelCollapsed}
          onlyOnEnabled={onlyOnEnabled}
          onToggleOnlyOn={onToggleOnlyOn}
          onlyOnHint={onlyOnHint}
          clusterEnabled={clusterEnabled}
          onToggleCluster={toggleCluster}
          noteLabel={noteLabel}
          jumpLabel={t.mapUiExplore.jumpTo}
          jumps={jumps}
          onJump={jumpTo}
          warningChip={<BuoyLayerChip locale={locale} />}
          timeTrack={timeTrack}
          basemapMode={basemapMode}
          onBasemapChange={onBasemapChange}
          attributionHtml={attributionHtml}
        />
      )}

      {/* Sheet mobile — peek / meio / aberto. A linha do topo do sheet
          («Melhor agora») é a 1ª linha de viewRows, a mesma fonte de
          score dos marcadores. */}
      {isMobile && (
        <MapExploreSheet
          {...mapHud}
          locale={locale}
          isPt={isPt}
          spotCount={hudSpotCount}
          state={exploreSheetState}
          onStateChange={setExploreSheetState}
          rows={viewRows}
          focusSpotId={focusSpotId}
          onSelectRow={(row) => focusSpot(row.spotId)}
          layers={sheetLayers}
          extras={sheetExtras}
          basemapMode={basemapMode}
          onBasemapChange={onBasemapChange}
          exitFullscreenLabel={exitFullscreenLabel}
          onExitFullscreen={onExitFullscreen}
          onlyOnEnabled={onlyOnEnabled}
          onToggleOnlyOn={onToggleOnlyOn}
          onlyOnHint={onlyOnHint}
          clusterEnabled={clusterEnabled}
          onToggleCluster={toggleCluster}
          bestLabel={bestLabel}
          noteLabel={noteLabel}
          jumpLabel={t.mapUiExplore.jumpTo}
          jumps={jumps}
          onJump={jumpTo}
          warningChip={<BuoyLayerChip locale={locale} />}
          legendNode={<MapLegend locale={locale} embedded {...legendLayerProps} />}
          timeTrack={timeTrack}
          attributionHtml={attributionHtml}
          openHeight={openHeight}
        />
      )}
    </>
  );
}
