import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';

/** Spot + live conditions + scores — shared by map markers and SpotMapInteractive. */
export interface MapSpotData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

export function getBestScore(
  data: MapSpotData,
  sport: GridSportFilter,
  scoreOverride?: number,
): number {
  if (typeof scoreOverride === 'number' && Number.isFinite(scoreOverride)) {
    return scoreOverride;
  }
  if (sport === 'all') {
    return Math.max(...Object.values(data.allScores).map((s) => s?.score || 0));
  }
  if (sport === 'big-wave') {
    return data.allScores.surf?.score || 0;
  }
  return data.allScores[sport]?.score || 0;
}
