import type { SportScore } from '@/lib/sportScore'
import { SCORE_TIER_THRESHOLDS } from '@/lib/sportScore'
import type { SportType, GridSportFilter } from '@/lib/sportRatings'
import { getCompatibleSports, SPORT_LABELS } from '@/lib/sportRatings'
import type { Spot } from '@/types'
import type { MarineConditionsFields } from '@/lib/marineConditions'

export const LS_SPORT_KEY = 'ventu:sport'

export const SPORT_CHANGE_EVENT = 'ventu:sport-change'

const VALID_FILTERS: GridSportFilter[] = [
  'all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'big-wave', 'foil', 'sup', 'wakeboard',
]

export interface HomepageSpotData {
  spot: Spot
  conditions: MarineConditionsFields
  allScores: Record<SportType, SportScore>
  bestWindowToday: import('@/lib/bestWindowToday').BestWindowToday | null
  bestWindowsBySport: import('@/lib/bestWindowToday').BestWindowsBySport
}

export function parseSportFilter(value?: string | null): GridSportFilter {
  if (value && VALID_FILTERS.includes(value as GridSportFilter)) {
    return value as GridSportFilter
  }
  return 'surf'
}

const LEGACY_SPORT_KEY = 'windspot:sport'

/** Read persisted grid sport; migrates legacy `windspot:sport` → `ventu:sport`. */
export function readSportFromStorage(): GridSportFilter {
  if (typeof window === 'undefined') return 'surf'
  try {
    const v = localStorage.getItem(LS_SPORT_KEY) ?? localStorage.getItem(LEGACY_SPORT_KEY)
    if (localStorage.getItem(LEGACY_SPORT_KEY) && !localStorage.getItem(LS_SPORT_KEY) && v) {
      localStorage.setItem(LS_SPORT_KEY, v)
      localStorage.removeItem(LEGACY_SPORT_KEY)
    }
    return parseSportFilter(v)
  } catch {
    return 'surf'
  }
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

/** Sports shown in the home "Top agora" / «A bombar agora» row. */
export const TOP_NOW_SPORTS = ['surf', 'kitesurf', 'windsurf', 'bodyboard'] as const
export type TopNowSport = (typeof TOP_NOW_SPORTS)[number]

/**
 * Minimum score to appear under «A bombar agora».
 * Same bar as map «Só a bombar» — never show Fraco/Mau as “firing”.
 */
export const TOP_NOW_MIN_SCORE = SCORE_TIER_THRESHOLDS.good

export function getTopSpotForSport(
  spotsData: HomepageSpotData[],
  sport: TopNowSport,
  minScore: number = TOP_NOW_MIN_SCORE,
): HomepageSpotData | null {
  const sorted = sortSpotsBySport(spotsData, sport)
  return sorted.find((d) => getScoreForFilter(d, sport) >= minScore) ?? null
}

/** Spot slugs featured in home "Top agora" — exclude from ranked list below map. */
export function getTopNowExcludedSlugs(spotsData: HomepageSpotData[]): string[] {
  const slugs: string[] = []
  for (const sport of TOP_NOW_SPORTS) {
    const top = getTopSpotForSport(spotsData, sport)
    if (top && !slugs.includes(top.spot.slug)) slugs.push(top.spot.slug)
  }
  return slugs
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
