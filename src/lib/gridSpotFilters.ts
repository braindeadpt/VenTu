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

export function spotMatchesSportFilter(data: GridSpotData, sport: GridSportFilter): boolean {
  if (sport === 'all') return true;
  if (sport === 'big-wave') return data.spot.type === 'big-wave';
  const compatible = getCompatibleSports(data.spot);
  if (!compatible.includes(sport)) return false;
  return (data.allScores[sport]?.score ?? 0) >= PLAYABLE_THRESHOLD;
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
