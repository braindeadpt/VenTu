import { validateLocale } from '@/lib/i18n'
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

/**
 * Desporto ESCOLHIDO pelo utilizador nos pills da homepage. Separado de
 * `ventu:sport`, que o grid e o /mapa gravam automaticamente (incl. o
 * default «surf» no mount) e por isso não distingue escolha de omissão.
 */
export const LS_SPORT_CHOSEN_KEY = 'ventu:sport-chosen'

/** Desporto escolhido explicitamente nos pills da home, ou null. */
export function readChosenSportFromStorage(): GridSportFilter | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(LS_SPORT_CHOSEN_KEY)
    return v && VALID_FILTERS.includes(v as GridSportFilter) ? (v as GridSportFilter) : null
  } catch {
    return null
  }
}

/** Grava a escolha explícita (clique num pill da home). */
export function rememberChosenSport(sport: GridSportFilter) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_SPORT_CHOSEN_KEY, sport)
    localStorage.setItem(LS_SPORT_KEY, sport)
  } catch {
    /* noop */
  }
}

/**
 * «A bombar agora», ticker e banner seguem as condições (todos os
 * desportos) quando o utilizador não escolheu desporto ou escolheu «Todos».
 */
export function isConditionDriven(sport: GridSportFilter, explicit: boolean): boolean {
  return !explicit || sport === 'all'
}

export interface HomepageSpotData {
  spot: Spot
  conditions: MarineConditionsFields
  allScores: Record<SportType, SportScore>
  bestWindowToday: import('@/lib/bestWindowToday').BestWindowToday | null
  bestWindowsBySport: import('@/lib/bestWindowToday').BestWindowsBySport
  /** Melhor janela ≥Bom por desporto nas próximas 48h (escala canónica). */
  upcomingWindowsBySport: import('@/lib/bestWindowToday').UpcomingWindowsBySport
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

export function getSportLabel(sport: GridSportFilter, locale: string): string {
  const loc = validateLocale(locale)
  if (sport === 'all') {
    return {
      pt: 'todos os desportos',
      en: 'all sports',
      es: 'todos los deportes',
      de: 'alle Sportarten',
      fr: 'tous les sports',
    }[loc]
  }
  if (sport === 'big-wave') return 'Big Wave'
  return SPORT_LABELS[sport][loc === 'pt' ? 'pt' : 'en']
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

export interface TopNowCard {
  sport: Exclude<GridSportFilter, 'all'>
  data: HomepageSpotData
}

/** Cards por defeito quando o filtro é um desporto concreto. */
export const TOP_NOW_SINGLE_SPORT_CARDS = 4

/** Cards de «A bombar agora» no modo adaptativo (sem desporto escolhido / «Todos»). */
export const TOP_NOW_AUTO_CARDS = 4

/** Máximo de cards do mesmo desporto no modo adaptativo. */
export const TOP_NOW_MAX_PER_SPORT = 2

interface TopNowCandidate {
  sport: TopNowSport
  data: HomepageSpotData
  score: number
}

function byScoreThenSlug(a: TopNowCandidate, b: TopNowCandidate): number {
  if (b.score !== a.score) return b.score - a.score
  if (a.data.spot.slug !== b.data.spot.slug) return a.data.spot.slug < b.data.spot.slug ? -1 : 1
  return TOP_NOW_SPORTS.indexOf(a.sport) - TOP_NOW_SPORTS.indexOf(b.sport)
}

/**
 * Modo adaptativo de «A bombar agora»: o que está mesmo a dar agora, em
 * todos os desportos de TOP_NOW_SPORTS. Dia de ondulação → surf; dia de vento
 * → kite/windsurf; dia misto → ambos.
 *
 * - Só pares (spot, desporto) ≥ `minScore` (Bom, o mesmo limiar do ticker).
 * - No máximo `TOP_NOW_MAX_PER_SPORT` cards por desporto e um card por spot
 *   (um spot de surf+bodyboard não ocupa dois lugares).
 * - 1.ª passagem: o melhor card de cada desporto a bombar (por ordem do seu
 *   melhor score), para um dia misto mostrar sempre os dois lados; 2.ª
 *   passagem: completa por score. O resultado sai ordenado por score.
 */
function getAdaptiveTopNowCards(
  spotsData: HomepageSpotData[],
  maxCards: number,
  minScore: number,
): TopNowCard[] {
  const candidates: TopNowCandidate[] = []
  for (const data of spotsData) {
    for (const sport of TOP_NOW_SPORTS) {
      const score = getScoreForFilter(data, sport)
      if (score >= minScore) candidates.push({ sport, data, score })
    }
  }
  candidates.sort(byScoreThenSlug)

  const picked: TopNowCandidate[] = []
  const usedSpots = new Set<string>()
  const perSport = new Map<TopNowSport, number>()
  const take = (c: TopNowCandidate) => {
    picked.push(c)
    usedSpots.add(c.data.spot.slug)
    perSport.set(c.sport, (perSport.get(c.sport) ?? 0) + 1)
  }

  // 1.ª passagem — diversidade: o melhor spot livre de cada desporto a bombar.
  for (const c of candidates) {
    if (picked.length >= maxCards) break
    if (perSport.has(c.sport) || usedSpots.has(c.data.spot.slug)) continue
    take(c)
  }
  // 2.ª passagem — completa por score, respeitando o tecto por desporto.
  for (const c of candidates) {
    if (picked.length >= maxCards) break
    if (usedSpots.has(c.data.spot.slug)) continue
    if ((perSport.get(c.sport) ?? 0) >= TOP_NOW_MAX_PER_SPORT) continue
    take(c)
  }

  return picked.sort(byScoreThenSlug).map(({ sport, data }) => ({ sport, data }))
}

/**
 * Cards de «A bombar agora».
 * - `all` (modo adaptativo — desporto não escolhido ou «Todos»): até
 *   `TOP_NOW_AUTO_CARDS` spots ≥ Bom de todos os desportos, por score, no
 *   máximo `TOP_NOW_MAX_PER_SPORT` por desporto (ver getAdaptiveTopNowCards).
 * - desporto concreto escolhido: os melhores spots desse desporto ≥ `minScore`.
 */
export function getTopNowCards(
  spotsData: HomepageSpotData[],
  sport: GridSportFilter,
  maxCards?: number,
  minScore: number = TOP_NOW_MIN_SCORE,
): TopNowCard[] {
  if (sport === 'all') {
    return getAdaptiveTopNowCards(spotsData, maxCards ?? TOP_NOW_AUTO_CARDS, minScore)
  }
  return sortSpotsBySport(spotsData, sport)
    .filter((d) => spotMatchesFeaturedFilter(d, sport, minScore))
    .slice(0, maxCards ?? TOP_NOW_SINGLE_SPORT_CARDS)
    .map((data) => ({ sport, data }))
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

/** Spots únicos com score ≥ threshold em algum desporto de TOP_NOW_SPORTS
 *  (contagem do ticker no modo adaptativo — mesma base de «A bombar agora»). */
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
