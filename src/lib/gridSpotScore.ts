import type { GridSpotData } from '@/lib/gridSpotFilters';
import type { GridSportFilter, SportType } from '@/lib/sportRatings';

function getScoreSport(sport: GridSportFilter): SportType | null {
  if (sport === 'all' || sport === 'big-wave') return sport === 'big-wave' ? 'surf' : null;
  return sport;
}

/** Score used for grid cards, map markers, and ranked lists. */
export function getGridSpotScore(data: GridSpotData, sport: GridSportFilter): number {
  if (sport === 'all') {
    return Math.max(...Object.values(data.allScores).map((s) => s.score || 0), 0);
  }
  if (sport === 'big-wave') {
    return data.spot.type === 'big-wave' ? (data.allScores.surf?.score ?? 0) : 0;
  }
  const key = getScoreSport(sport);
  if (!key) return 0;
  return data.allScores[key]?.score ?? 0;
}

export function spotDetailHref(
  locale: string,
  slug: string,
  sport: GridSportFilter,
): string {
  if (sport !== 'all' && sport !== 'big-wave') {
    return `/${locale}/spots/${slug}/?sport=${sport}`;
  }
  return `/${locale}/spots/${slug}/`;
}
