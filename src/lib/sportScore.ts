// Sport-Specific Scoring System
// Each sport has its own criteria — NO mixed generic score

import { getTranslation } from '@/lib/i18n';
import { Spot } from '@/types'
import { SportType, getCompatibleSports } from './sportRatings'
import { SCORE_TIER_THRESHOLDS, notaToScore, scoreTierFromScore } from './nota'

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
  factors: string[]        // What makes this score ["1.4m ondas", "Vento offshore"]
  factorsEn: string[]      // Same, English — hero «why this score» row
  warning?: string         // Warning if applicable
  warningEn?: string
  /** Wind sports only: offshore component that makes the session unsafe
   *  (`windSportDirectionSafety`). The UI renders a visible note from it. */
  directionSafety?: WindSafetyLevel
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
  /** Below session min: linear scale (not flat 15). */
  WIND_PTS_MIN_KT: 15,
  WIND_MARGINAL_PTS_PER_KT: 2.2,
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

export type WindCategory = 'onshore' | 'side-onshore' | 'side-offshore' | 'offshore'

export function classifyWind(spot: Spot, windDir: number): WindCategory {
  const angleDiff = Math.abs(windDir - (spot.coastOrientation || 270))
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff

  // normalizedDiff: 0 = directly onshore, 180 = directly offshore, 90 = cross-shore
  if (normalizedDiff <= 40) return 'onshore'
  if (normalizedDiff <= 90) return 'side-onshore'
  if (normalizedDiff <= 140) return 'side-offshore'
  return 'offshore'
}

// ─── Wind-sport direction safety (kite / windsurf / foil / wing) ───

/** Finer direction bands for wind sports — cross-shore is its own band. */
export type WindSportDirection =
  | 'onshore'
  | 'side-onshore'
  | 'cross-shore'
  | 'side-offshore'
  | 'offshore'

/** Offshore component that must be surfaced as a safety note. */
export type WindSafetyLevel = 'side-offshore' | 'offshore'

/** Offshore wind caps the whole wind-sport nota here (/10, #210). */
export const WIND_SPORT_OFFSHORE_SCORE_CAP = 2.5
/** Tecto do score com vento curto (kite/windsurf) — valor da fórmula, independente das bandas (#210). */
const WIND_SHORT_SCORE_CAP = 39

/** Side-offshore caps the whole wind-sport nota here (/10, #195) — never Bom/Muito bom. */
export const WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP = 5.0

/** Sports scored with `windSportDirectionSafety` (wing joins when it lands). */
export function isWindDirectionSport(sport: SportType): boolean {
  return sport === 'kitesurf' || sport === 'windsurf' || sport === 'foil'
}

export interface WindSportDirectionSafety {
  direction: WindSportDirection
  /** 0 = straight onshore, 90 = cross-shore, 180 = straight offshore. */
  angleFromOnshore: number
  /** Share (0–1) of the sport's direction points. */
  dirFactor: number
  safety: WindSafetyLevel | null
  /** Upper bound for the total nota (/10), or null when uncapped. */
  scoreCap: number | null
}

/** Bands in degrees from straight onshore (see docs/CONTEXT.md «Scoring»). */
const WIND_SPORT_DIRECTION_BANDS: ReadonlyArray<{
  maxAngle: number
  direction: WindSportDirection
  dirFactor: number
}> = [
  { maxAngle: 40, direction: 'onshore', dirFactor: 0.5 },        // aceitável — chop, empurra para a praia
  { maxAngle: 69, direction: 'side-onshore', dirFactor: 0.8 },   // bom — volta à praia sozinho
  { maxAngle: 100, direction: 'cross-shore', dirFactor: 1 },     // ideal — bordos ao longo da costa
  { maxAngle: 140, direction: 'side-offshore', dirFactor: 0.3 }, // só avançados, com barco de apoio
  { maxAngle: 180, direction: 'offshore', dirFactor: 0 },        // perigo de deriva para o mar
]

function angleFromOnshore(spot: Spot, windDir: number): number {
  const angleDiff = Math.abs(windDir - (spot.coastOrientation || 270)) % 360
  return angleDiff > 180 ? 360 - angleDiff : angleDiff
}

/**
 * Direction quality + safety for wind sports (kite, windsurf, foil — and wing
 * when it lands). Cross-shore / side-onshore are ideal; pure onshore is
 * rideable but choppy; any offshore component drifts the rider out to sea
 * with gusty, holey wind near the beach — partial points + a note for
 * side-offshore, zero points; both cap the total nota (5,0 / 2,5 /10).
 */
export function windSportDirectionSafety(spot: Spot, windDir: number): WindSportDirectionSafety {
  const angle = angleFromOnshore(spot, windDir)
  const band =
    WIND_SPORT_DIRECTION_BANDS.find((b) => angle <= b.maxAngle) ??
    WIND_SPORT_DIRECTION_BANDS[WIND_SPORT_DIRECTION_BANDS.length - 1]
  const safety: WindSafetyLevel | null =
    band.direction === 'offshore' || band.direction === 'side-offshore' ? band.direction : null
  return {
    direction: band.direction,
    angleFromOnshore: angle,
    dirFactor: band.dirFactor,
    safety,
    scoreCap:
      band.direction === 'offshore'
        ? WIND_SPORT_OFFSHORE_SCORE_CAP
        : band.direction === 'side-offshore'
          ? WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP
          : null,
  }
}

/** Direction points for a wind sport (redistributed within the 100-pt cap). */
function windDirFactor(dir: WindSportDirectionSafety, maxPts: number): number {
  return Math.round(maxPts * dir.dirFactor)
}

/**
 * Caps the non-direction points at `100 − maxDirPts` so a saturated session
 * (kite: wind+gust+waves+temp can exceed 100) still ranks by direction —
 * cross-shore 20 kt must beat onshore 20 kt instead of both pinning at 100.
 */
function withDirectionHeadroom(score: number, dirPts: number, maxDirPts: number): number {
  return Math.min(score - dirPts, 100 - maxDirPts) + dirPts
}

/** Applies the offshore / side-offshore cap and the visible safety warning to a wind-sport score. */
function applyWindSafety(
  result: SportScore,
  dir: WindSportDirectionSafety,
): SportScore {
  if (!dir.safety) return result
  // Tecto arredondado PARA BAIXO na escala da nota: 2,5 → 20 (2 · Não dá).
  // Com 25 a nota mostrada era round(2,5) = 3 · Fraco, acima do tecto (auditoria 16/10, M7).
  const score = dir.scoreCap !== null ? Math.min(result.score, notaToScore(Math.floor(dir.scoreCap + 1e-9))) : result.score
  const pt = getTranslation('pt').windSafety
  const en = getTranslation('en').windSafety
  const key = dir.safety === 'offshore' ? 'offshore' : 'sideOffshore'
  return {
    ...result,
    score,
    ...getRatingLabels(score),
    warning: pt[key],
    warningEn: en[key],
    directionSafety: dir.safety,
  }
}

// ─── Sport Scoring Logic ───

function scoreSurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const factorsEn: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  const waveScore = Math.min(c.waveHeight * SURF_CONFIG.WAVE_PTS_PER_M, SURF_CONFIG.WAVE_PTS_MAX)
  score += waveScore
  if (c.waveHeight > 0.5) {
    factors.push(`${c.waveHeight.toFixed(1)}m ondas`)
    factorsEn.push(`${c.waveHeight.toFixed(1)}m waves`)
  }

  const periodScore = Math.min((c.wavePeriod - SURF_CONFIG.PERIOD_BASE_S) * SURF_CONFIG.PERIOD_PTS_PER_S, SURF_CONFIG.PERIOD_PTS_MAX)
  score += Math.max(0, periodScore)
  if (c.wavePeriod > 8) {
    factors.push(`${c.wavePeriod.toFixed(0)}s período`)
    factorsEn.push(`${c.wavePeriod.toFixed(0)}s period`)
  }

  const angleDiff = Math.abs(c.windDirection - (spot.coastOrientation || 270))
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff
  const isOffshore = normalizedDiff > 90
  const windScore = isOffshore
    ? Math.max(0, SURF_CONFIG.WIND_OFFSHORE_MAX - windKt * SURF_CONFIG.WIND_OFFSHORE_DECAY)
    : Math.max(0, SURF_CONFIG.WIND_OTHER_MAX - windKt * SURF_CONFIG.WIND_OTHER_DECAY)
  score += windScore
  if (isOffshore) {
    factors.push('Vento offshore')
    factorsEn.push('Offshore wind')
  } else if (windKt < 10) {
    factors.push('Vento fraco')
    factorsEn.push('Light wind')
  }

  score += Math.min(c.waterTemp * SURF_CONFIG.TEMP_PTS_PER_DEG, SURF_CONFIG.TEMP_PTS_MAX)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    factorsEn,
    primaryFactor: `${c.waveHeight.toFixed(1)}m @ ${c.wavePeriod.toFixed(0)}s`,
  }
}

function scoreKitesurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const factorsEn: string[] = []
  const pushFactor = (pt: string, en: string) => {
    factors.push(pt)
    factorsEn.push(en)
  }
  let score = 0

  const windKt = c.windSpeed * 1.94384
  const dirSafety = windSportDirectionSafety(spot, c.windDirection)

  if (windKt < KITE_CONFIG.WIND_PTS_MIN_KT) {
    score = Math.round(windKt * KITE_CONFIG.WIND_MARGINAL_PTS_PER_KT)
    if (windKt >= 8) {
      const dirPts = Math.round(windDirFactor(dirSafety, KITE_CONFIG.WIND_DIR_PTS_MAX) * 0.5)
      score += dirPts
      if (dirPts > 0) pushFactor(`Vento ${dirSafety.direction}`, `${dirSafety.direction} wind`)
    }
    score = Math.min(score, WIND_SHORT_SCORE_CAP)
    pushFactor('Vento insuficiente', 'Not enough wind')
  } else if (windKt < KITE_CONFIG.WIND_SESSION_MIN_KT) {
    score = Math.round(windKt * KITE_CONFIG.WIND_PTS_PER_KT)
    pushFactor(`${windKt.toFixed(0)}kt vento fraco`, `${windKt.toFixed(0)}kt light wind`)
    score = Math.min(score, WIND_SHORT_SCORE_CAP)
  } else {
    let windScore = 0
    if (windKt >= KITE_CONFIG.WIND_IDEAL_MIN_KT && windKt <= KITE_CONFIG.WIND_IDEAL_MAX_KT) {
      windScore = KITE_CONFIG.WIND_PTS_IDEAL
      pushFactor(`${windKt.toFixed(0)}kt vento`, `${windKt.toFixed(0)}kt wind`)
    } else if (windKt > KITE_CONFIG.WIND_IDEAL_MAX_KT) {
      windScore = KITE_CONFIG.WIND_STRONG_PTS
      pushFactor(`${windKt.toFixed(0)}kt vento forte`, `${windKt.toFixed(0)}kt strong wind`)
    } else {
      windScore = windKt * KITE_CONFIG.WIND_PTS_PER_KT
      pushFactor(`${windKt.toFixed(0)}kt vento`, `${windKt.toFixed(0)}kt wind`)
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
      pushFactor('Ondas pequenas', 'Small waves')
    } else if (c.waveHeight < KITE_CONFIG.WAVE_MED_MAX) {
      score += KITE_CONFIG.WAVE_MED_PTS
    }

    const dirPts = windDirFactor(dirSafety, KITE_CONFIG.WIND_DIR_PTS_MAX)
    score += dirPts
    // «Xkt vento» já está na lista — a direcção vai nua para não repetir.
    // A label vem da mesma banda que pontua (#195), não do classifyWind.
    if (dirPts > 0) pushFactor(dirSafety.direction, dirSafety.direction)

    score += Math.min(c.waterTemp * KITE_CONFIG.TEMP_PTS_PER_DEG, KITE_CONFIG.TEMP_PTS_MAX)
    score = withDirectionHeadroom(score, dirPts, KITE_CONFIG.WIND_DIR_PTS_MAX)
  }

  score = Math.round(Math.min(100, Math.max(0, score)))

  return applyWindSafety({
    score,
    ...getRatingLabels(score),
    factors,
    factorsEn,
    warning: windKt > 35 ? 'Vento muito forte — apenas avançados' : windKt < KITE_CONFIG.WIND_SESSION_MIN_KT ? 'Vento fraco — mínimo ~15kt para kite' : undefined,
    warningEn: windKt > 35 ? 'Very strong wind — advanced only' : windKt < KITE_CONFIG.WIND_SESSION_MIN_KT ? 'Light wind — ~15kt minimum for kite' : undefined,
    primaryFactor: `${windKt.toFixed(0)}kt`,
  }, dirSafety)
}

function scoreWindsurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const factorsEn: string[] = []
  const pushFactor = (pt: string, en: string) => {
    factors.push(pt)
    factorsEn.push(en)
  }
  let score = 0

  const windKt = c.windSpeed * 1.94384
  const dirSafety = windSportDirectionSafety(spot, c.windDirection)

  if (windKt < WIND_CONFIG.WIND_PTS_MIN_KT) {
    score = Math.round(windKt * WIND_CONFIG.WIND_MARGINAL_PTS_PER_KT)
    if (windKt >= 10) {
      const dirPts = Math.round(windDirFactor(dirSafety, WIND_CONFIG.WIND_DIR_PTS_MAX) * 0.5)
      score += dirPts
      if (dirPts > 0) pushFactor(`Vento ${dirSafety.direction}`, `${dirSafety.direction} wind`)
    }
    score = Math.min(score, WIND_SHORT_SCORE_CAP)
    pushFactor('Vento insuficiente', 'Not enough wind')
  } else {
    if (windKt >= WIND_CONFIG.WIND_IDEAL_MIN_KT && windKt <= WIND_CONFIG.WIND_IDEAL_MAX_KT) {
      score += WIND_CONFIG.WIND_IDEAL_PTS
      pushFactor(`${windKt.toFixed(0)}kt vento`, `${windKt.toFixed(0)}kt wind`)
    } else {
      score += windKt * WIND_CONFIG.WIND_PTS_PER_KT
      pushFactor(`${windKt.toFixed(0)}kt vento`, `${windKt.toFixed(0)}kt wind`)
    }

    if (c.waveHeight > WIND_CONFIG.WAVE_IDEAL_MIN && c.waveHeight < WIND_CONFIG.WAVE_IDEAL_MAX) {
      score += WIND_CONFIG.WAVE_IDEAL_PTS
      pushFactor(`${c.waveHeight.toFixed(1)}m ondas`, `${c.waveHeight.toFixed(1)}m waves`)
    } else if (c.waveHeight < 4) {
      score += WIND_CONFIG.WAVE_OTHER_PTS
    }

    const windDirPts = windDirFactor(dirSafety, WIND_CONFIG.WIND_DIR_PTS_MAX)
    score += windDirPts
    if (windDirPts > 0) pushFactor(dirSafety.direction, dirSafety.direction)

    score += Math.min(c.waterTemp * WIND_CONFIG.TEMP_PTS_PER_DEG, WIND_CONFIG.TEMP_PTS_MAX)
  }

  score = Math.round(Math.min(100, Math.max(0, score)))

  return applyWindSafety({
    score,
    ...getRatingLabels(score),
    factors,
    factorsEn,
    warning: windKt < WIND_CONFIG.WIND_PTS_MIN_KT ? 'Mínimo ~15kt para windsurf' : undefined,
    warningEn: windKt < WIND_CONFIG.WIND_PTS_MIN_KT ? '~15kt minimum for windsurf' : undefined,
    primaryFactor: `${windKt.toFixed(0)}kt`,
  }, dirSafety)
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
      factorsEn: ['No wake infrastructure'],
      warning: 'Este spot não tem infraestrutura para wakeboard',
      warningEn: 'This spot has no wakeboard infrastructure',
      primaryFactor: 'N/A',
    }
  }

  const label = wakeboardAvailabilityLabel(spot)
  return {
    score: 80,
    rating: 'Disponível',
    ratingEn: 'Available',
    factors: [label.pt],
    factorsEn: [label.en],
    primaryFactor: label.primary,
  }
}

function scoreBodyboard(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const factorsEn: string[] = []
  let score = 0

  const windKt = c.windSpeed * 1.94384

  const waveScore = Math.min(c.waveHeight * BODYBOARD_CONFIG.WAVE_PTS_PER_M, BODYBOARD_CONFIG.WAVE_PTS_MAX)
  score += waveScore
  if (c.waveHeight > 0.3) {
    factors.push(`${c.waveHeight.toFixed(1)}m ondas`)
    factorsEn.push(`${c.waveHeight.toFixed(1)}m waves`)
  }

  score += Math.min((c.wavePeriod - BODYBOARD_CONFIG.PERIOD_BASE_S) * BODYBOARD_CONFIG.PERIOD_PTS_PER_S, BODYBOARD_CONFIG.PERIOD_PTS_MAX)
  if (c.wavePeriod > 6) {
    factors.push(`${c.wavePeriod.toFixed(0)}s período`)
    factorsEn.push(`${c.wavePeriod.toFixed(0)}s period`)
  }

  score += Math.max(0, BODYBOARD_CONFIG.WIND_MAX - windKt * BODYBOARD_CONFIG.WIND_DECAY)

  score += Math.min(c.waterTemp * BODYBOARD_CONFIG.TEMP_PTS_PER_DEG, BODYBOARD_CONFIG.TEMP_PTS_MAX)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    factorsEn,
    primaryFactor: `${c.waveHeight.toFixed(1)}m`,
  }
}

function scoreSUP(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const factorsEn: string[] = []
  const pushFactor = (pt: string, en: string) => {
    factors.push(pt)
    factorsEn.push(en)
  }
  let score = 0

  const windKt = c.windSpeed * 1.94384

  if (c.waveHeight < SUP_CONFIG.WAVE_FLAT_MAX) {
    score += SUP_CONFIG.WAVE_FLAT_PTS
    pushFactor('Água plana', 'Flat water')
  } else if (c.waveHeight < SUP_CONFIG.WAVE_SMALL_MAX) {
    score += SUP_CONFIG.WAVE_SMALL_PTS
    pushFactor('Ondas pequenas', 'Small waves')
  } else if (c.waveHeight < SUP_CONFIG.WAVE_MED_MAX) {
    score += SUP_CONFIG.WAVE_MED_PTS
  }

  if (windKt < SUP_CONFIG.WIND_LIGHT_MAX_KT) {
    score += SUP_CONFIG.WIND_LIGHT_PTS
    pushFactor('Vento fraco', 'Light wind')
  } else if (windKt < SUP_CONFIG.WIND_MODERATE_MAX_KT) {
    score += SUP_CONFIG.WIND_MODERATE_PTS
  }

  score += Math.min(c.waterTemp * SUP_CONFIG.TEMP_PTS_PER_DEG, SUP_CONFIG.TEMP_PTS_MAX)
  if (c.waterTemp > 15) pushFactor(`${c.waterTemp.toFixed(0)}°C água`, `${c.waterTemp.toFixed(0)}°C water`)

  score += Math.max(0, 10 - c.wavePeriod * SUP_CONFIG.PERIOD_PENALTY)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    factorsEn,
    primaryFactor: c.waveHeight < 0.5 ? 'Plano' : `${c.waveHeight.toFixed(1)}m`,
  }
}

function scoreFoil(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  const factorsEn: string[] = []
  const pushFactor = (pt: string, en: string) => {
    factors.push(pt)
    factorsEn.push(en)
  }
  const windKt = c.windSpeed * 1.94384

  let score = 0

  if (windKt >= FOIL_CONFIG.WIND_IDEAL_MIN_KT && windKt <= FOIL_CONFIG.WIND_IDEAL_MAX_KT) {
    score += FOIL_CONFIG.WIND_IDEAL_PTS
    pushFactor(`${windKt.toFixed(0)}kt vento ideal`, `${windKt.toFixed(0)}kt ideal wind`)
  } else if (windKt >= 5 && windKt < FOIL_CONFIG.WIND_IDEAL_MIN_KT) {
    score += FOIL_CONFIG.WIND_LIGHT_PTS
    pushFactor('Vento fraco', 'Light wind')
  } else if (windKt > FOIL_CONFIG.WIND_IDEAL_MAX_KT && windKt <= 35) {
    score += FOIL_CONFIG.WIND_STRONG_PTS
    pushFactor('Vento forte', 'Strong wind')
  } else {
    score += FOIL_CONFIG.WIND_MIN_PTS
  }

  if (c.waveHeight < FOIL_CONFIG.WAVE_FLAT_MAX) {
    score += FOIL_CONFIG.WAVE_FLAT_PTS
    pushFactor('Água plana', 'Flat water')
  } else if (c.waveHeight < FOIL_CONFIG.WAVE_SMALL_MAX) {
    score += FOIL_CONFIG.WAVE_SMALL_PTS
  } else if (c.waveHeight < FOIL_CONFIG.WAVE_MED_MAX) {
    score += FOIL_CONFIG.WAVE_MED_PTS
  }

  // Wind direction: cross-shore ideal, offshore unsafe (0-8 pts, cap)
  const dirSafety = windSportDirectionSafety(spot, c.windDirection)
  const dirPts = windDirFactor(dirSafety, FOIL_CONFIG.WIND_DIR_PTS_MAX)
  score += dirPts
  if (dirPts > 0) pushFactor(dirSafety.direction, dirSafety.direction)

  score += Math.min(c.waterTemp * FOIL_CONFIG.TEMP_PTS_PER_DEG, FOIL_CONFIG.TEMP_PTS_MAX)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return applyWindSafety({
    score,
    ...getRatingLabels(score),
    factors,
    factorsEn,
    primaryFactor: windKt >= 10 && windKt <= 25 ? 'Vento ideal' : `${windKt.toFixed(0)}kt`,
  }, dirSafety)
}

// ─── Helpers ───

export { SCORE_TIER_THRESHOLDS }

function getRatingLabels(score: number): { rating: string; ratingEn: string } {
  if (!(score > 0)) return { rating: 'N/A', ratingEn: 'N/A' }
  const tier = scoreTierFromScore(score)
  return { rating: getScoreTierLabel(tier, 'pt'), ratingEn: getScoreTierLabel(tier, 'en') }
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
    default: return { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], factorsEn: [], primaryFactor: 'N/A' }
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
  return scoreTierFromScore(score)
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

/** Etiquetas de tier do score — 5 línguas (bloco `tiers`). */
export function getScoreTierLabel(tier: ScoreTier, locale: string = 'pt'): string {
  const t = getTranslation(locale).tiers
  switch (tier) {
    case 'epic':
      return t.epic
    case 'good':
      return t.good
    case 'fair':
      return t.fair
    case 'poor':
      return t.poor
    default:
      return t.closed
  }
}

/**
 * Wind-direction quality for display tinting — mirrors the scorer: for wind
 * sports `windSportDirectionSafety` (cross-shore / side-onshore ideal, any
 * offshore component is a drift-out hazard); for wave sports offshore
 * grooms the face.
 * Returns null when the relation is neutral (no tint).
 */
export function windQualityTier(
  spot: Spot,
  windDirection: number,
  sport: SportType,
): 'good' | 'fair' | 'poor' | null {
  if (isWindDirectionSport(sport)) {
    const { direction } = windSportDirectionSafety(spot, windDirection)
    if (direction === 'cross-shore' || direction === 'side-onshore') return 'good'
    if (direction === 'onshore') return 'fair'
    return 'poor'
  }
  const cat = classifyWind(spot, windDirection)
  if (sport === 'wakeboard') return null
  // surf / bodyboard / sup — offshore cleans the face
  if (cat === 'offshore' || cat === 'side-offshore') return 'good'
  if (cat === 'side-onshore') return 'fair'
  return 'poor'
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
