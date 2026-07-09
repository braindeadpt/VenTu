// Sport-Specific Scoring System
// Each sport has its own criteria — NO mixed generic score

import { Spot } from '@/types'
import { SportType, getCompatibleSports } from './sportRatings'

export interface Conditions {
  waveHeight: number
  wavePeriod: number
  waveDirection: number
  windSpeed: number        // m/s (Open-Meteo with wind_speed_unit=ms)
  windDirection: number
  windGust: number
  waterTemp: number
}

export interface SportScore {
  score: number            // 0-100 for THIS sport
  rating: string           // "Épico", "Bom", "Razoável", "Fraco", "N/A"
  ratingEn: string
  factors: string[]        // What makes this score ["Ondas 2.1m", "Vento offshore 15kt"]
  warning?: string         // Warning if applicable
  primaryFactor: string    // The main metric (waves for surf, wind for kite)
}

// ─── Per-sport config ───

const SURF_CONFIG = {
  WAVE_PTS_MAX: 40,
  WAVE_PTS_PER_M: 15,
  PERIOD_PTS_MAX: 20,
  PERIOD_BASE_S: 5,
  PERIOD_PTS_PER_S: 3,
  WIND_OFFSHORE_MAX: 25,
  WIND_OFFSHORE_DECAY: 0.5,
  WIND_OTHER_MAX: 15,
  WIND_OTHER_DECAY: 0.3,
  TEMP_PTS_MAX: 15,
  TEMP_PTS_PER_DEG: 0.5,
} as const

const BODYBOARD_CONFIG = {
  WAVE_PTS_MAX: 45,
  WAVE_PTS_PER_M: 18,
  PERIOD_PTS_MAX: 20,
  PERIOD_BASE_S: 4,
  PERIOD_PTS_PER_S: 3,
  WIND_MAX: 25,
  WIND_DECAY: 0.4,
  TEMP_PTS_MAX: 10,
  TEMP_PTS_PER_DEG: 0.4,
} as const

const KITE_CONFIG = {
  /** Below this: no «Razoável» — flat sea / gusts must not inflate the score. */
  WIND_SESSION_MIN_KT: 15,
  WIND_IDEAL_MIN_KT: 15,
  WIND_IDEAL_MAX_KT: 30,
  WIND_PTS_IDEAL: 60,
  WIND_STRONG_PTS: 50,
  WIND_PTS_PER_KT: 2,
  /** Marginal band 12–14 kt before session minimum; no secondary bonuses. */
  WIND_PTS_MIN_KT: 12,
  /** Below 12 kt: linear scale (not flat 15) — still capped below «Razoável». */
  WIND_MARGINAL_PTS_PER_KT: 2.5,
  GUST_LOW_MAX: 10,
  GUST_LOW_PTS: 15,
  GUST_MED_MAX: 20,
  GUST_MED_PTS: 10,
  GUST_HIGH_PTS: 5,
  WAVE_SMALL_MAX: 1.5,
  WAVE_SMALL_PTS: 15,
  WAVE_MED_MAX: 2.5,
  WAVE_MED_PTS: 8,
  TEMP_PTS_MAX: 10,
  TEMP_PTS_PER_DEG: 0.3,
  WIND_DIR_PTS_MAX: 10,
} as const

const WIND_CONFIG = {
  WIND_SESSION_MIN_KT: 15,
  WIND_IDEAL_MIN_KT: 15,
  WIND_IDEAL_MAX_KT: 28,
  WIND_IDEAL_PTS: 55,
  WIND_PTS_PER_KT: 2,
  /** Windsurf planing threshold — no score from waves/temp below this. */
  WIND_PTS_MIN_KT: 15,
  WAVE_IDEAL_MIN: 1,
  WAVE_IDEAL_MAX: 3,
  WAVE_IDEAL_PTS: 20,
  WAVE_OTHER_PTS: 10,
  TEMP_PTS_MAX: 10,
  TEMP_PTS_PER_DEG: 0.3,
  WIND_DIR_PTS_MAX: 10,
} as const

const FOIL_CONFIG = {
  WIND_IDEAL_MIN_KT: 10,
  WIND_IDEAL_MAX_KT: 25,
  WIND_IDEAL_PTS: 50,
  WIND_LIGHT_PTS: 25,
  WIND_STRONG_PTS: 20,
  WIND_MIN_PTS: 5,
  WAVE_FLAT_MAX: 0.5,
  WAVE_FLAT_PTS: 25,
  WAVE_SMALL_MAX: 1.0,
  WAVE_SMALL_PTS: 15,
  WAVE_MED_MAX: 1.5,
  WAVE_MED_PTS: 5,
  TEMP_PTS_MAX: 15,
  TEMP_PTS_PER_DEG: 0.4,
  WIND_DIR_PTS_MAX: 8,
} as const

const SUP_CONFIG = {
  WAVE_FLAT_MAX: 0.5,
  WAVE_FLAT_PTS: 40,
  WAVE_SMALL_MAX: 1.0,
  WAVE_SMALL_PTS: 30,
  WAVE_MED_MAX: 1.5,
  WAVE_MED_PTS: 15,
  WIND_LIGHT_MAX_KT: 15,
  WIND_LIGHT_PTS: 30,
  WIND_MODERATE_MAX_KT: 25,
  WIND_MODERATE_PTS: 15,
  TEMP_PTS_MAX: 20,
  TEMP_PTS_PER_DEG: 0.6,
  PERIOD_PENALTY: 0.5,
} as const

// ─── Wind direction helper ───

type WindCategory = 'onshore' | 'side-onshore' | 'side-offshore' | 'offshore'

function classifyWind(spot: Spot, windDir: number): WindCategory {
  const angleDiff = Math.abs(windDir - (spot.coastOrientation || 270))
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff

  // normalizedDiff: 0 = directly onshore, 180 = directly offshore, 90 = cross-shore
  if (normalizedDiff <= 40) return 'onshore'
  if (normalizedDiff <= 90) return 'side-onshore'
  if (normalizedDiff <= 140) return 'side-offshore'
  return 'offshore'
}

/**
 * Wind direction score contribution for kite / windsurf / foil.
 * Gives max points for side-offshore (cross-shore with slight offshore component),
 * partial for side-onshore, minimal for pure onshore/offshore.
 * Values are intentionally modest (redistribute within the 100-pt cap).
 */
function windDirFactor(category: WindCategory, maxPts: number): number {
  switch (category) {
    case 'side-offshore': return maxPts           // ideal — ride along beach, clean wind
    case 'side-onshore':  return Math.round(maxPts * 0.5)  // OK — some chop, still rideable
    case 'offshore':      return Math.round(maxPts * 0.2)  // safety concern (drifting out)
    case 'onshore':       return Math.round(maxPts * 0.15) // poor — blown toward beach, chop
  }
}

// ─── Sport Scoring Logic ───

function scoreSurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  const waveScore = Math.min(c.waveHeight * SURF_CONFIG.WAVE_PTS_PER_M, SURF_CONFIG.WAVE_PTS_MAX)
  score += waveScore
  if (c.waveHeight > 0.5) factors.push(`${c.waveHeight.toFixed(1)}m ondas`)

  const periodScore = Math.min((c.wavePeriod - SURF_CONFIG.PERIOD_BASE_S) * SURF_CONFIG.PERIOD_PTS_PER_S, SURF_CONFIG.PERIOD_PTS_MAX)
  score += Math.max(0, periodScore)
  if (c.wavePeriod > 8) factors.push(`${c.wavePeriod.toFixed(0)}s período`)

  const angleDiff = Math.abs(c.windDirection - (spot.coastOrientation || 270))
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff
  const isOffshore = normalizedDiff > 90
  const windScore = isOffshore
    ? Math.max(0, SURF_CONFIG.WIND_OFFSHORE_MAX - windKt * SURF_CONFIG.WIND_OFFSHORE_DECAY)
    : Math.max(0, SURF_CONFIG.WIND_OTHER_MAX - windKt * SURF_CONFIG.WIND_OTHER_DECAY)
  score += windScore
  if (isOffshore) factors.push('Vento offshore')
  else if (windKt < 10) factors.push('Vento fraco')

  score += Math.min(c.waterTemp * SURF_CONFIG.TEMP_PTS_PER_DEG, SURF_CONFIG.TEMP_PTS_MAX)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    primaryFactor: `${c.waveHeight.toFixed(1)}m @ ${c.wavePeriod.toFixed(0)}s`,
  }
}

function scoreKitesurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  if (windKt < KITE_CONFIG.WIND_PTS_MIN_KT) {
    score = Math.round(windKt * KITE_CONFIG.WIND_MARGINAL_PTS_PER_KT)
    if (windKt >= 8) {
      const kiteWindCat = classifyWind(spot, c.windDirection)
      const dirPts = Math.round(windDirFactor(kiteWindCat, KITE_CONFIG.WIND_DIR_PTS_MAX) * 0.5)
      score += dirPts
      if (dirPts > 0) factors.push(`Vento ${windCategoryLabel(kiteWindCat)}`)
    }
    score = Math.min(score, SCORE_TIER_THRESHOLDS.fair - 1)
    factors.push('Vento insuficiente')
  } else if (windKt < KITE_CONFIG.WIND_SESSION_MIN_KT) {
    score = Math.round(windKt * KITE_CONFIG.WIND_PTS_PER_KT)
    factors.push(`${windKt.toFixed(0)}kt vento fraco`)
    score = Math.min(score, SCORE_TIER_THRESHOLDS.fair - 1)
  } else {
    let windScore = 0
    if (windKt >= KITE_CONFIG.WIND_IDEAL_MIN_KT && windKt <= KITE_CONFIG.WIND_IDEAL_MAX_KT) {
      windScore = KITE_CONFIG.WIND_PTS_IDEAL
      factors.push(`${windKt.toFixed(0)}kt vento`)
    } else if (windKt > KITE_CONFIG.WIND_IDEAL_MAX_KT) {
      windScore = KITE_CONFIG.WIND_STRONG_PTS
      factors.push(`${windKt.toFixed(0)}kt vento forte`)
    } else {
      windScore = windKt * KITE_CONFIG.WIND_PTS_PER_KT
      factors.push(`${windKt.toFixed(0)}kt vento`)
    }
    score += windScore

    const gustDiff = c.windGust - c.windSpeed
    if (gustDiff < KITE_CONFIG.GUST_LOW_MAX) {
      score += KITE_CONFIG.GUST_LOW_PTS
    } else if (gustDiff < KITE_CONFIG.GUST_MED_MAX) {
      score += KITE_CONFIG.GUST_MED_PTS
    } else {
      score += KITE_CONFIG.GUST_HIGH_PTS
    }

    if (c.waveHeight < KITE_CONFIG.WAVE_SMALL_MAX) {
      score += KITE_CONFIG.WAVE_SMALL_PTS
      factors.push('Ondas pequenas')
    } else if (c.waveHeight < KITE_CONFIG.WAVE_MED_MAX) {
      score += KITE_CONFIG.WAVE_MED_PTS
    }

    const kiteWindCat = classifyWind(spot, c.windDirection)
    const dirPts = windDirFactor(kiteWindCat, KITE_CONFIG.WIND_DIR_PTS_MAX)
    score += dirPts
    if (dirPts > 0) factors.push(`Vento ${windCategoryLabel(kiteWindCat)}`)

    score += Math.min(c.waterTemp * KITE_CONFIG.TEMP_PTS_PER_DEG, KITE_CONFIG.TEMP_PTS_MAX)
  }

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    warning: windKt > 35 ? 'Vento muito forte — apenas avançados' : windKt < KITE_CONFIG.WIND_SESSION_MIN_KT ? 'Vento fraco — mínimo ~15kt para kite' : undefined,
    primaryFactor: `${windKt.toFixed(0)}kt`,
  }
}

function scoreWindsurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  if (windKt < WIND_CONFIG.WIND_PTS_MIN_KT) {
    score = Math.round(Math.min(15, windKt * 3))
    factors.push('Vento insuficiente')
  } else {
    if (windKt >= WIND_CONFIG.WIND_IDEAL_MIN_KT && windKt <= WIND_CONFIG.WIND_IDEAL_MAX_KT) {
      score += WIND_CONFIG.WIND_IDEAL_PTS
      factors.push(`${windKt.toFixed(0)}kt vento`)
    } else {
      score += windKt * WIND_CONFIG.WIND_PTS_PER_KT
      factors.push(`${windKt.toFixed(0)}kt vento`)
    }

    if (c.waveHeight > WIND_CONFIG.WAVE_IDEAL_MIN && c.waveHeight < WIND_CONFIG.WAVE_IDEAL_MAX) {
      score += WIND_CONFIG.WAVE_IDEAL_PTS
      factors.push(`${c.waveHeight.toFixed(1)}m ondas`)
    } else if (c.waveHeight < 4) {
      score += WIND_CONFIG.WAVE_OTHER_PTS
    }

    const windCategory = classifyWind(spot, c.windDirection)
    const windDirPts = windDirFactor(windCategory, WIND_CONFIG.WIND_DIR_PTS_MAX)
    score += windDirPts
    if (windDirPts > 0) factors.push(`Vento ${windCategoryLabel(windCategory)}`)

    score += Math.min(c.waterTemp * WIND_CONFIG.TEMP_PTS_PER_DEG, WIND_CONFIG.TEMP_PTS_MAX)
  }

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    warning: windKt < WIND_CONFIG.WIND_PTS_MIN_KT ? 'Mínimo ~15kt para windsurf' : undefined,
    primaryFactor: `${windKt.toFixed(0)}kt`,
  }
}

function wakeboardAvailabilityLabel(spot: Spot): { pt: string; en: string; primary: string } {
  const facilities = (spot.facilities ?? []).map((f) => f.toLowerCase())
  if (facilities.some((f) => f.includes('teleski') || f.includes('cable'))) {
    return { pt: 'Cable/teleski disponível', en: 'Cable/teleski available', primary: 'Cable' }
  }
  if (facilities.some((f) => f.includes('escola wake') || f.includes('barco'))) {
    return { pt: 'Sessões com barco', en: 'Boat-tow sessions', primary: 'Barco' }
  }
  if (spot.type === 'wakeboard') {
    return { pt: 'Wake disponível', en: 'Wake available', primary: 'Wake' }
  }
  return { pt: 'Infraestrutura wake', en: 'Wake infrastructure', primary: 'Wake' }
}

function scoreWakeboard(spot: Spot, c: Conditions): SportScore {
  const hasWakeInfra =
    spot.type === 'wakeboard' ||
    spot.facilities?.some((f) => {
      const x = f.toLowerCase()
      return (
        x.includes('cable') ||
        x.includes('teleski') ||
        x.includes('wake') ||
        x.includes('lagoa') ||
        x.includes('barco')
      )
    })

  if (!hasWakeInfra) {
    return {
      score: 0,
      rating: 'N/A',
      ratingEn: 'N/A',
      factors: ['Sem infraestrutura wake'],
      warning: 'Este spot não tem infraestrutura para wakeboard',
      primaryFactor: 'N/A',
    }
  }

  const label = wakeboardAvailabilityLabel(spot)
  return {
    score: 80,
    rating: 'Disponível',
    ratingEn: 'Available',
    factors: [label.pt],
    primaryFactor: label.primary,
  }
}

function scoreBodyboard(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  const waveScore = Math.min(c.waveHeight * BODYBOARD_CONFIG.WAVE_PTS_PER_M, BODYBOARD_CONFIG.WAVE_PTS_MAX)
  score += waveScore
  if (c.waveHeight > 0.3) factors.push(`${c.waveHeight.toFixed(1)}m ondas`)

  score += Math.min((c.wavePeriod - BODYBOARD_CONFIG.PERIOD_BASE_S) * BODYBOARD_CONFIG.PERIOD_PTS_PER_S, BODYBOARD_CONFIG.PERIOD_PTS_MAX)
  if (c.wavePeriod > 6) factors.push(`${c.wavePeriod.toFixed(0)}s período`)

  score += Math.max(0, BODYBOARD_CONFIG.WIND_MAX - windKt * BODYBOARD_CONFIG.WIND_DECAY)

  score += Math.min(c.waterTemp * BODYBOARD_CONFIG.TEMP_PTS_PER_DEG, BODYBOARD_CONFIG.TEMP_PTS_MAX)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    primaryFactor: `${c.waveHeight.toFixed(1)}m`,
  }
}

function scoreSUP(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  if (c.waveHeight < SUP_CONFIG.WAVE_FLAT_MAX) {
    score += SUP_CONFIG.WAVE_FLAT_PTS
    factors.push('Água plana')
  } else if (c.waveHeight < SUP_CONFIG.WAVE_SMALL_MAX) {
    score += SUP_CONFIG.WAVE_SMALL_PTS
    factors.push('Ondas pequenas')
  } else if (c.waveHeight < SUP_CONFIG.WAVE_MED_MAX) {
    score += SUP_CONFIG.WAVE_MED_PTS
  }

  if (windKt < SUP_CONFIG.WIND_LIGHT_MAX_KT) {
    score += SUP_CONFIG.WIND_LIGHT_PTS
    factors.push('Vento fraco')
  } else if (windKt < SUP_CONFIG.WIND_MODERATE_MAX_KT) {
    score += SUP_CONFIG.WIND_MODERATE_PTS
  }

  score += Math.min(c.waterTemp * SUP_CONFIG.TEMP_PTS_PER_DEG, SUP_CONFIG.TEMP_PTS_MAX)
  if (c.waterTemp > 15) factors.push(`${c.waterTemp.toFixed(0)}°C água`)

  score += Math.max(0, 10 - c.wavePeriod * SUP_CONFIG.PERIOD_PENALTY)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    primaryFactor: c.waveHeight < 0.5 ? 'Plano' : `${c.waveHeight.toFixed(1)}m`,
  }
}

function scoreFoil(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const windKt = c.windSpeed * 1.94384

  let score = 0

  if (windKt >= FOIL_CONFIG.WIND_IDEAL_MIN_KT && windKt <= FOIL_CONFIG.WIND_IDEAL_MAX_KT) {
    score += FOIL_CONFIG.WIND_IDEAL_PTS
    factors.push(`${windKt.toFixed(0)}kt vento ideal`)
  } else if (windKt >= 5 && windKt < FOIL_CONFIG.WIND_IDEAL_MIN_KT) {
    score += FOIL_CONFIG.WIND_LIGHT_PTS
    factors.push('Vento fraco')
  } else if (windKt > FOIL_CONFIG.WIND_IDEAL_MAX_KT && windKt <= 35) {
    score += FOIL_CONFIG.WIND_STRONG_PTS
    factors.push('Vento forte')
  } else {
    score += FOIL_CONFIG.WIND_MIN_PTS
  }

  if (c.waveHeight < FOIL_CONFIG.WAVE_FLAT_MAX) {
    score += FOIL_CONFIG.WAVE_FLAT_PTS
    factors.push('Água plana')
  } else if (c.waveHeight < FOIL_CONFIG.WAVE_SMALL_MAX) {
    score += FOIL_CONFIG.WAVE_SMALL_PTS
  } else if (c.waveHeight < FOIL_CONFIG.WAVE_MED_MAX) {
    score += FOIL_CONFIG.WAVE_MED_PTS
  }

  // Wind direction: side-offshore ideal, chop from onshore hurts foil (0-8 pts)
  const category = classifyWind(spot, c.windDirection)
  const dirPts = windDirFactor(category, FOIL_CONFIG.WIND_DIR_PTS_MAX)
  score += dirPts
  if (dirPts > 0) factors.push(`Vento ${windCategoryLabel(category)}`)

  score += Math.min(c.waterTemp * FOIL_CONFIG.TEMP_PTS_PER_DEG, FOIL_CONFIG.TEMP_PTS_MAX)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    primaryFactor: windKt >= 10 && windKt <= 25 ? 'Vento ideal' : `${windKt.toFixed(0)}kt`,
  }
}

// ─── Helpers ───

function windCategoryLabel(category: WindCategory): string {
  switch (category) {
    case 'offshore': return 'offshore'
    case 'side-offshore': return 'side-offshore'
    case 'side-onshore': return 'side-onshore'
    case 'onshore': return 'onshore'
  }
}

/** Score tier thresholds — aligned with globals.css (80 / 60 / 40 / 20). */
export const SCORE_TIER_THRESHOLDS = {
  epic: 80,
  good: 60,
  fair: 40,
  poor: 20,
} as const

function getRatingLabels(score: number): { rating: string; ratingEn: string } {
  if (score >= SCORE_TIER_THRESHOLDS.epic) return { rating: 'Épico!', ratingEn: 'Epic!' }
  if (score >= SCORE_TIER_THRESHOLDS.good) return { rating: 'Bom', ratingEn: 'Good' }
  if (score >= SCORE_TIER_THRESHOLDS.fair) return { rating: 'Razoável', ratingEn: 'Fair' }
  if (score >= SCORE_TIER_THRESHOLDS.poor) return { rating: 'Fraco', ratingEn: 'Poor' }
  if (score > 0) return { rating: 'Mau', ratingEn: 'Bad' }
  return { rating: 'N/A', ratingEn: 'N/A' }
}

// ─── Main Export ───

export function getSportScore(spot: Spot, sport: SportType, conditions: Conditions): SportScore {
  switch (sport) {
    case 'surf': return scoreSurf(spot, conditions)
    case 'kitesurf': return scoreKitesurf(spot, conditions)
    case 'windsurf': return scoreWindsurf(spot, conditions)
    case 'wakeboard': return scoreWakeboard(spot, conditions)
    case 'bodyboard': return scoreBodyboard(spot, conditions)
    case 'sup': return scoreSUP(spot, conditions)
    case 'foil': return scoreFoil(spot, conditions)
    default: return { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: 'N/A' }
  }
}

export function getAllSportScores(spot: Spot, conditions: Conditions): Record<SportType, SportScore> {
  return {
    surf: getSportScore(spot, 'surf', conditions),
    kitesurf: getSportScore(spot, 'kitesurf', conditions),
    windsurf: getSportScore(spot, 'windsurf', conditions),
    wakeboard: getSportScore(spot, 'wakeboard', conditions),
    bodyboard: getSportScore(spot, 'bodyboard', conditions),
    sup: getSportScore(spot, 'sup', conditions),
    foil: getSportScore(spot, 'foil', conditions),
  }
}

/** Calculate per-hour scores for a sport from hourly forecast data.
 *  Missing fields in hourly fallback to currentConditions. */
export function getHourlyScores(
  spot: Spot,
  sport: SportType,
  hourly: Array<{
    waveHeight: number
    wavePeriod: number
    windSpeed: number
    windDirection: number
    windGust?: number
    waterTemp?: number
  }>,
  currentConditions: Conditions,
): number[] {
  return hourly.map((h) => {
    const hourConditions: Conditions = {
      waveHeight: h.waveHeight,
      wavePeriod: h.wavePeriod,
      waveDirection: currentConditions.waveDirection,
      windSpeed: h.windSpeed,
      windDirection: h.windDirection,
      windGust: h.windGust ?? currentConditions.windGust,
      waterTemp: h.waterTemp ?? currentConditions.waterTemp,
    }
    return getSportScore(spot, sport, hourConditions).score
  })
}

export type ScoreTier = 'epic' | 'good' | 'fair' | 'poor' | 'closed'

export interface ScoreTokens {
  tier: ScoreTier
  text: string
  bg: string
  border: string
  ring: string
  glow: string
}

function scoreTierName(score: number): ScoreTier {
  if (score >= SCORE_TIER_THRESHOLDS.epic) return 'epic'
  if (score >= SCORE_TIER_THRESHOLDS.good) return 'good'
  if (score >= SCORE_TIER_THRESHOLDS.fair) return 'fair'
  if (score >= SCORE_TIER_THRESHOLDS.poor) return 'poor'
  return 'closed'
}

/** Single source of truth for score → design-system colour tokens. */
export function getScoreTokens(score: number): ScoreTokens {
  const tier = scoreTierName(score)
  return {
    tier,
    text: `text-score-${tier}`,
    bg: `bg-score-${tier}/15`,
    border: `border-score-${tier}/25`,
    ring: `ring-score-${tier}/40`,
    glow: `shadow-glow-${tier}`,
  }
}

const SCORE_TIER_LABELS: Record<ScoreTier, { pt: string; en: string }> = {
  epic: { pt: 'Épico', en: 'Epic' },
  good: { pt: 'Bom', en: 'Good' },
  fair: { pt: 'Razoável', en: 'Fair' },
  poor: { pt: 'Fraco', en: 'Poor' },
  closed: { pt: 'Fechado', en: 'Closed' },
}

export function getScoreTierLabel(tier: ScoreTier, locale: 'pt' | 'en' = 'pt'): string {
  return SCORE_TIER_LABELS[tier][locale]
}

/** @deprecated Use getScoreTokens — kept for existing imports. */
export function getScoreColor(score: number) {
  const tokens = getScoreTokens(score)
  return {
    bg: tokens.bg.replace('/15', '/20'),
    text: tokens.text,
    border: tokens.border.replace('/25', '/30'),
    glow: tokens.glow,
  }
}

/** Sports shown in spot tabs / drawer — same set as map filters (compatibleSports). */
export function getRelevantSports(
  spot: Spot,
  _allScores?: Record<SportType, SportScore>,
): SportType[] {
  return getCompatibleSports(spot)
}
