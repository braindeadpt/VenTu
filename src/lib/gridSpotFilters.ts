import { getMacroRegion } from '@/lib/regions';
import { getCompatibleSports, type SportType, type GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { Spot } from '@/types';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { DEFAULT_REGION } from '@/lib/gridFilters';

export const PLAYABLE_THRESHOLD = 30;

export interface GridSpotData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

/** Map + grid sport filter: show every spot where the modality makes sense (score still on marker). */
export function spotMatchesSportFilter(data: GridSpotData, sport: GridSportFilter): boolean {
  if (sport === 'all') return true;
  if (sport === 'big-wave') return data.spot.type === 'big-wave';
  return getCompatibleSports(data.spot).includes(sport);
}

/** List sections that only want “playable now” spots (top 3, alternatives). */
export function spotMeetsPlayableScore(
  data: GridSpotData,
  sport: SportType,
  minScore = PLAYABLE_THRESHOLD,
): boolean {
  return (data.allScores[sport]?.score ?? 0) >= minScore;
}

export function spotMatchesRegionFilter(data: GridSpotData, region: string): boolean {
  if (region === DEFAULT_REGION) return true;
  return getMacroRegion(data.spot.region) === region;
}

export function filterGridSpots(
  spotsData: GridSpotData[],
  sport: GridSportFilter,
  region: string,
): GridSpotData[] {
  return spotsData.filter(
    (d) => spotMatchesSportFilter(d, sport) && spotMatchesRegionFilter(d, region),
  );
}
