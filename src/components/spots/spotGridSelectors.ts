import {
  spotMatchesRegionFilter,
  spotMeetsPlayableScore,
  PLAYABLE_THRESHOLD,
} from '@/lib/gridSpotFilters';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import type { GridSportFilter, SportType } from '@/lib/sportRatings';
import { scoreToNota } from '@/lib/nota';
import { scoreTodos } from '@/lib/desportosV6';
import { localizedSpotName } from '@/lib/localizedSpotText';

export function getScoreSport(sport: GridSportFilter): SportType | null {
  if (sport === 'all' || sport === 'big-wave') return sport === 'big-wave' ? 'surf' : null;
  return sport;
}

export function onCount(sorted: GridSpotData[], selectedSport: GridSportFilter): number {
  return sorted.filter(d => {
    if (selectedSport === 'all') {
      return scoreTodos(d.spot, d.allScores) >= 70;
    }
    const scoreKey = getScoreSport(selectedSport)!;
    return (d.allScores[scoreKey]?.score || 0) >= 70;
  }).length;
}

export function marginalCount(sorted: GridSpotData[], selectedSport: GridSportFilter): number {
  return sorted.filter(d => {
    if (selectedSport === 'all') {
      const best = scoreTodos(d.spot, d.allScores);
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

/** Score 0–100 que o ranking do /spots usa: `all` = melhor modalidade do spot. */
export function rankingScore(d: GridSpotData, selectedSport: GridSportFilter): number {
  if (selectedSport === 'all') return scoreTodos(d.spot, d.allScores);
  const scoreKey = getScoreSport(selectedSport)!;
  return d.allScores[scoreKey]?.score || 0;
}

/**
 * Ordem do ranking do /spots (e das grelhas de /explorar e /modalidades):
 * pela NOTA INTEIRA que a lista mostra (#218 PR 4) — dois spots com «7» não
 * se ordenam por décimas escondidas do motor —, depois nome localizado e
 * slug (o mesmo desempate do Top 8 da home), para a ordem não depender da
 * ordem de entrada.
 */
export function compareRanking(
  a: GridSpotData,
  b: GridSpotData,
  selectedSport: GridSportFilter,
  locale: string,
): number {
  const byNota = scoreToNota(rankingScore(b, selectedSport)) - scoreToNota(rankingScore(a, selectedSport));
  if (byNota !== 0) return byNota;
  const byName = localizedSpotName(a.spot, locale).localeCompare(localizedSpotName(b.spot, locale), locale);
  if (byName !== 0) return byName;
  return a.spot.slug.localeCompare(b.spot.slug);
}
