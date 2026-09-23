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
import type { MapSpotListRow } from '../components/MapSpotList';
import type { MapLayersMenuItem } from '../components/MapLayersMenu';
import type { MapLayersFields } from './MapLayersZone';
import { useMapUiActions, useMapUiData } from '../MapUiContext';

type MapTranslation = ReturnType<typeof getTranslation>;
type MapHudProps = Omit<MapFullscreenHudProps, 'isPt' | 'visible'>;

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
  const [openHeight, setOpenHeight] = useState(620);
  useEffect(() => {
    const sync = () => setOpenHeight(Math.min(Math.round(window.innerHeight * 0.82), 720));
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

  return {
    exploreSheetState, setExploreSheetState,
    panelCollapsed, setPanelCollapsed,
    openHeight, viewRows, sheetExtras,
    clusterLabel, onlyOnLabel, onlyOnHint, hudSpotCount,
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
  const { isPt, locale, focusSpotId } = useMapUiData();
  const { focusSpot } = useMapUiActions();
  const {
    exploreSheetState, setExploreSheetState,
    panelCollapsed, setPanelCollapsed,
    openHeight, viewRows, sheetExtras,
    onlyOnLabel, onlyOnHint, hudSpotCount,
  } = state;

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
          onlyOnLabel={onlyOnLabel}
          onlyOnHint={onlyOnHint}
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
          clusterItem={sheetExtras.find((i) => i.key === 'cluster')}
          basemapMode={basemapMode}
          onBasemapChange={onBasemapChange}
          exitFullscreenLabel={exitFullscreenLabel}
          onExitFullscreen={onExitFullscreen}
          onlyOnEnabled={onlyOnEnabled}
          onToggleOnlyOn={onToggleOnlyOn}
          onlyOnLabel={onlyOnLabel}
          onlyOnHint={onlyOnHint}
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
