import type { SportScore } from '@/lib/sportScore'
import type { SportType, GridSportFilter } from '@/lib/sportRatings'
import { getCompatibleSports, SPORT_LABELS } from '@/lib/sportRatings'
import type { Spot } from '@/types'
import type { MarineConditionsFields } from '@/lib/marineConditions'

export const LS_SPORT_KEY = 'windspot:sport'

export const SPORT_CHANGE_EVENT = 'ventu:sport-change'

const VALID_FILTERS: GridSportFilter[] = [
  'all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'big-wave', 'foil', 'sup', 'wakeboard',
]

export interface HomepageSpotData {
  spot: Spot
  conditions: MarineConditionsFields
  allScores: Record<SportType, SportScore>
}

export function parseSportFilter(value?: string | null): GridSportFilter {
  if (value && VALID_FILTERS.includes(value as GridSportFilter)) {
    return value as GridSportFilter
  }
  return 'surf'
}

export function getScoreForFilter(
  data: HomepageSpotData,
  sport: GridSportFilter,
): number {
  if (sport === 'big-wave') {
    return data.spot.type === 'big-wave' ? (data.allScores.surf?.score ?? 0) : 0
  }
  if (sport === 'all') {
    const compatible = getCompatibleSports(data.spot)
    return Math.max(...compatible.map(s => data.allScores[s]?.score ?? 0), 0)
  }
  const compatible = getCompatibleSports(data.spot)
  if (!compatible.includes(sport)) return 0
  return data.allScores[sport]?.score ?? 0
}

export function spotMatchesFeaturedFilter(
  data: HomepageSpotData,
  sport: GridSportFilter,
  minScore = 1,
): boolean {
  if (sport === 'big-wave') return data.spot.type === 'big-wave' && getScoreForFilter(data, sport) >= minScore
  if (sport === 'all') return getScoreForFilter(data, sport) >= minScore
  const compatible = getCompatibleSports(data.spot)
  return compatible.includes(sport) && (data.allScores[sport]?.score ?? 0) >= minScore
}

export function sortSpotsBySport(
  spotsData: HomepageSpotData[],
  sport: GridSportFilter,
): HomepageSpotData[] {
  return [...spotsData].sort(
    (a, b) => getScoreForFilter(b, sport) - getScoreForFilter(a, sport),
  )
}

export function getOnCount(
  spotsData: HomepageSpotData[],
  sport: GridSportFilter,
  threshold = 70,
): number {
  return spotsData.filter(d => getScoreForFilter(d, sport) >= threshold).length
}

export function getSportLabel(sport: GridSportFilter, isPt: boolean): string {
  if (sport === 'all') return isPt ? 'todos os desportos' : 'all sports'
  if (sport === 'big-wave') return isPt ? 'Big Wave' : 'Big Wave'
  return SPORT_LABELS[sport][isPt ? 'pt' : 'en']
}

/** Sports shown in the home "Top agora" row. */
export const TOP_NOW_SPORTS = ['surf', 'kitesurf', 'windsurf'] as const
export type TopNowSport = (typeof TOP_NOW_SPORTS)[number]

export function getTopSpotForSport(
  spotsData: HomepageSpotData[],
  sport: TopNowSport,
): HomepageSpotData | null {
  const sorted = sortSpotsBySport(spotsData, sport)
  return sorted.find((d) => getScoreForFilter(d, sport) > 0) ?? null
}

/** Unique spots with score ≥ threshold for surf, kitesurf or windsurf. */
export function getTotalOnCount(
  spotsData: HomepageSpotData[],
  threshold = 70,
): number {
  return spotsData.filter((d) =>
    TOP_NOW_SPORTS.some((s) => getScoreForFilter(d, s) >= threshold),
  ).length
}

export function dispatchSportChange(sport: GridSportFilter) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SPORT_CHANGE_EVENT, { detail: sport }))
}
