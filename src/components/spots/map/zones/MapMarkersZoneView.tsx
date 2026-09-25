'use client';

/**
 * MapMarkersZoneView — vista do compartimento «marcadores» (dono M4):
 * pré-visualização do spot — sheet mobile / cartão 320 px ancorado ao
 * marcador no desktop (maquete §7). Lê a selecção do contexto partilhado.
 *
 * Separado de MapMarkersZone.tsx (M7-F): só renderiza quando há um spot
 * seleccionado, por isso vive num chunk dinâmico — a árvore
 * MapSpotSheet/MapSpotCard (conteúdo do cartão, sparkline, factores) sai
 * da avaliação inicial do mapa e só carrega no primeiro clique.
 */

import { useCallback } from 'react';
import { getTranslation } from '@/lib/i18n';
import { mapHoursClock } from '@/lib/mapHours';
import MapSpotSheet from '../../MapSpotSheet';
import { MapSpotCard } from '../../MapSpotPreview';
import { useMapUiActions, useMapUiData } from '../MapUiContext';

export default function MapMarkersZone() {
  const {
    isMobile,
    isFullscreen,
    isHeroEmbed,
    sheetSpot,
    sport,
    locale,
    hourScores,
    hoursFrame,
    hoursLive,
    hoursTimes,
  } = useMapUiData();
  const { closeSpotSheet, selectSpot, openExploreSheet } = useMapUiActions();
  const t = getTranslation(locale);

  // «←» do sheet volta à lista de spots do viewport: fecha a
  // pré-visualização e levanta o sheet de exploração (M6: acção do
  // MapUiContext — antes era o evento `ventu:open-explore-sheet`).
  const onBackToList = useCallback(() => {
    closeSpotSheet();
    openExploreSheet();
  }, [closeSpotSheet, openExploreSheet]);

  if (!sheetSpot) return null;
  const scoreOverride = hourScores?.get(sheetSpot.spot.id);
  const hourLabel =
    hoursLive && hoursTimes[hoursFrame]
      ? mapHoursClock(hoursTimes[hoursFrame])
      : t.mapUiMarkers.now;

  if (isMobile) {
    return (
      <MapSpotSheet
        data={sheetSpot}
        selectedSport={sport}
        locale={locale}
        onClose={closeSpotSheet}
        onBackToList={isFullscreen ? onBackToList : undefined}
        scoreOverride={scoreOverride}
        hoursFrame={hoursLive ? hoursFrame : 0}
        hourLabel={hourLabel}
        onViewSpot={selectSpot}
      />
    );
  }
  // Cartão só na superfície Explorar — os embeds mantêm o popup Leaflet.
  if (!isFullscreen || isHeroEmbed) return null;
  return (
    <MapSpotCard
      data={sheetSpot}
      locale={locale}
      highlightSport={sport}
      scoreOverride={scoreOverride}
      hoursFrame={hoursLive ? hoursFrame : 0}
      hourLabel={hourLabel}
      onClose={closeSpotSheet}
      onViewSpot={() => selectSpot(sheetSpot.spot.id)}
    />
  );
}
