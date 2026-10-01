'use client';

/**
 * MapExploreZoneView — vista do compartimento «explorar» (dono M3):
 * painel desktop (MapSpotPanel) e sheet mobile (MapExploreSheet).
 *
 * Separado de MapExploreZone.tsx (M7-F): o painel/sheet e a árvore de
 * lista/filtros avaliam-se num chunk próprio, carregado quando o mapa
 * fica pronto — tira ~um terço da avaliação do chunk principal.
 */

import { useCallback } from 'react';
import { getTranslation } from '@/lib/i18n';
import { mapHoursClock } from '@/lib/mapHours';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { BasemapMode } from '../../MapLayerToggle';
import MapLegend from '../../MapLegend';
import BuoyLayerChip from '../../BuoyLayerChip';
import MapExploreSheet from '../components/MapExploreSheet';
import MapSpotPanel from '../components/MapSpotPanel';
import type { MapLayersMenuItem } from '../components/MapLayersMenu';
import type { MapExploreState } from './MapExploreZone';
import type { MapLayersFields } from './MapLayersZone';
import { useMapUiActions, useMapUiData } from '../MapUiContext';

type MapHudProps = Omit<MapFullscreenHudProps, 'isPt' | 'visible'>;

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

export default function MapExploreZone({
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
  // Estável — mantém o memo de MapSpotList efectivo entre commits do
  // orquestrador (M7-F).
  const onSelectRow = useCallback(
    (row: { spotId: string }) => focusSpot(row.spotId),
    [focusSpot],
  );
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
          onSelectRow={onSelectRow}
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
          onSelectRow={onSelectRow}
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
