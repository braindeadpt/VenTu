import {
  spotMatchesRegionFilter,
  spotMeetsPlayableScore,
  PLAYABLE_THRESHOLD,
} from '@/lib/gridSpotFilters';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import type { GridSportFilter, SportType } from '@/lib/sportRatings';

export function getScoreSport(sport: GridSportFilter): SportType | null {
  if (sport === 'all' || sport === 'big-wave') return sport === 'big-wave' ? 'surf' : null;
  return sport;
}

export function onCount(sorted: GridSpotData[], selectedSport: GridSportFilter): number {
  return sorted.filter(d => {
    if (selectedSport === 'all') {
      return Math.max(...Object.values(d.allScores).map(s => s.score || 0)) >= 70;
    }
    const scoreKey = getScoreSport(selectedSport)!;
    return (d.allScores[scoreKey]?.score || 0) >= 70;
  }).length;
}

export function marginalCount(sorted: GridSpotData[], selectedSport: GridSportFilter): number {
  return sorted.filter(d => {
    if (selectedSport === 'all') {
      const best = Math.max(...Object.values(d.allScores).map(s => s.score || 0));
      return best >= 40 && best < 70;
    }
    const scoreKey = getScoreSport(selectedSport)!;
    const s = d.allScores[scoreKey]?.score || 0;
    return s >= 40 && s < 70;
  }).length;
}

export function top3(sorted: GridSpotData[], selectedSport: GridSportFilter): GridSpotData[] {
  if (selectedSport === 'all') return [];
  const scoreKey = getScoreSport(selectedSport)!;
  return sorted
    .filter(d => (d.allScores[scoreKey]?.score || 0) >= PLAYABLE_THRESHOLD)
    .slice(0, 3);
}

export function alternativeSport(
  spotsData: GridSpotData[],
  currentSport: GridSportFilter,
  region: string,
): SportType | null {
  if (currentSport === 'all' || currentSport === 'big-wave') return null;
  const counts: Record<string, number> = {};
  for (const data of spotsData) {
    if (!spotMatchesRegionFilter(data, region)) continue;
    for (const sport of Object.keys(data.allScores) as SportType[]) {
      if (sport === currentSport) continue;
      if (spotMeetsPlayableScore(data, sport, PLAYABLE_THRESHOLD)) {
        counts[sport] = (counts[sport] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? (entries[0][0] as SportType) : null;
}
