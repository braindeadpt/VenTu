import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { scoreTodos } from '@/lib/desportosV6';

/** Spot + live conditions + scores — shared by map markers and SpotMapInteractive. */
export interface MapSpotData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

/**
 * Score da hora activa das 48 h para um spot: número = score dessa hora;
 * `null` = noite (o v6 não dá nota nessa frame — #218 D3, só kite/surf/big-wave);
 * `undefined` = sem série → condições ao vivo.
 */
export type MapHourScore = number | null | undefined;

/** A frame activa é «noite» para este spot (marcador/lista/preview sem número). */
export function isMapNight(scoreOverride: MapHourScore): scoreOverride is null {
  return scoreOverride === null;
}

/** Score de ordenação de um spot de noite — abaixo de qualquer nota real (0–100). */
export const MAP_NIGHT_RANK = -1;

/**
 * Score para ORDENAR (lista, colisão de marcadores, melhor do cluster): os
 * spots de noite ficam sempre abaixo dos que têm nota. Para MOSTRAR, ver
 * `isMapNight` primeiro — um spot de noite não tem número.
 */
export function getMapRankScore(
  data: MapSpotData,
  sport: GridSportFilter,
  scoreOverride?: MapHourScore,
): number {
  return isMapNight(scoreOverride) ? MAP_NIGHT_RANK : getBestScore(data, sport, scoreOverride);
}

/**
 * Score numérico do spot. `null` (noite) é tratado como «sem override» e cai
 * nas condições ao vivo — quem mostra o score tem de ver `isMapNight` antes.
 */
export function getBestScore(
  data: MapSpotData,
  sport: GridSportFilter,
  scoreOverride?: MapHourScore,
): number {
  if (typeof scoreOverride === 'number' && Number.isFinite(scoreOverride)) {
    return scoreOverride;
  }
  if (sport === 'all') return scoreTodos(data.spot, data.allScores);
  if (sport === 'big-wave') {
    return data.allScores.surf?.score || 0;
  }
  return data.allScores[sport]?.score || 0;
}
