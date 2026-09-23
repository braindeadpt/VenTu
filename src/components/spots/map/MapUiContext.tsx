'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapSpotData } from '../mapSpotData';
import type { MapSpotSheetData } from '../MapSpotSheet';

/**
 * Estado partilhado do mapa (docs/design/MAP-ZONES.md): os filtros do
 * anfitrião, o eixo das 48 h e a selecção são lidos por várias zonas.
 *
 * Dois contextos separados — dados e acções (padrão do
 * SpotTimelineProvider) — para que quem só precisa das acções não
 * re-renderize com os dados.
 */
export interface MapUiData {
  /** Modalidade seleccionada no anfitrião (/mapa?spot=…, homepage). */
  sport: GridSportFilter;
  /** Região seleccionada no anfitrião («all»/slug) — filtra marcadores e a maré. */
  region: string;
  locale: string;
  isPt: boolean;
  /** Leaflet inicializado — os overlays só renderizam depois disto. */
  isReady: boolean;
  /** Clusters (markercluster) carregados. */
  clusterReady: boolean;
  isMobile: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  /** Eixo das 48 h — activo e a hora escolhida (vazio quando desligado). */
  hoursLive: boolean;
  hoursTimes: readonly string[];
  hoursFrame: number;
  /** Score por spot à hora escolhida; null fora do modo 48 h. */
  hourScores: Map<string, number> | null;
  /** Spots visíveis após os filtros — fonte única dos marcadores e da lista. */
  visibleSpots: readonly MapSpotData[];
  /** Deep link ?spot= — linha focada da lista. */
  focusSpotId?: string;
  /** Spot aberto na pré-visualização mobile (sheet de detalhe). */
  sheetSpot: MapSpotSheetData | null;
}

export interface MapUiActions {
  /** Navega para a página do spot (callback do anfitrião). */
  selectSpot: (spotId: string) => void;
  /** Voa até ao spot e abre a pré-visualização (popup desktop / sheet mobile). */
  focusSpot: (spotId: string, openDetail?: boolean) => void;
  /** Abre o spot na pré-visualização mobile. */
  openSpotSheet: (data: MapSpotSheetData) => void;
  closeSpotSheet: () => void;
  /** Índice da hora das 48 h (trilho temporal partilhado). */
  setHoursFrame: (index: number) => void;
  /** Toggles de vista — localizados na UI dentro da zona dona. */
  toggleCluster: () => void;
  toggleWind: () => void;
  toggleOnlyOn: () => void;
}

const MapUiDataContext = createContext<MapUiData | null>(null);
const MapUiActionsContext = createContext<MapUiActions | null>(null);

interface MapUiProviderProps {
  data: MapUiData;
  actions: MapUiActions;
  children: ReactNode;
}

export function MapUiProvider({ data, actions, children }: MapUiProviderProps) {
  return (
    <MapUiDataContext.Provider value={data}>
      <MapUiActionsContext.Provider value={actions}>
        {children}
      </MapUiActionsContext.Provider>
    </MapUiDataContext.Provider>
  );
}

/** Dados partilhados do mapa — re-renderiza quando os dados mudam. */
export function useMapUiData(): MapUiData {
  const ctx = useContext(MapUiDataContext);
  if (!ctx) throw new Error('useMapUiData requer MapUiProvider');
  return ctx;
}

/** Acções partilhadas — estáveis (callbacks memoizados no orquestrador). */
export function useMapUiActions(): MapUiActions {
  const ctx = useContext(MapUiActionsContext);
  if (!ctx) throw new Error('useMapUiActions requer MapUiProvider');
  return ctx;
}
