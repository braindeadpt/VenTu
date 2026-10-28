// Sport-Specific Scoring System
// Desde o motor único (#218, PR 6) este ficheiro só pontua SUP e wakeboard;
// guarda os tipos partilhados (`SportScore`, `Conditions`), a segurança do
// vento (`windSportDirectionSafety`, também usada pelo tecto do v6) e os
// tokens de cor / etiquetas das bandas.

import { getTranslation } from '@/lib/i18n';
import { Spot } from '@/types'
import { SportType, getCompatibleSports } from './sportRatings'
import { SCORE_TIER_THRESHOLDS, scoreTierFromScore } from './nota'

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

/** `null` em água interior (`spot.aguaInterior`): não há lado de mar nem de terra. */
export function classifyWind(spot: Spot, windDir: number): WindCategory | null {
  if (spot.aguaInterior) return null
  const angleDiff = Math.abs(windDir - (spot.coastOrientation ?? 270))
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

/** Side-offshore caps the whole wind-sport nota here (/10, #195) — never Bom/Muito bom. */
export const WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP = 5.0

/** Sports scored with `windSportDirectionSafety` (wing joins when it lands). */
export function isWindDirectionSport(sport: SportType): boolean {
  return sport === 'kitesurf' || sport === 'windsurf' || sport === 'foil'
}

export interface WindSportDirectionSafety {
  /** `null` em água interior (`spot.aguaInterior`): direcção neutra, sem banda. */
  direction: WindSportDirection | null
  /** 0 = straight onshore, 90 = cross-shore, 180 = straight offshore; `null` em água interior. */
  angleFromOnshore: number | null
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

function angleFromOnshore(spot: Pick<Spot, 'coastOrientation'>, windDir: number): number {
  const angleDiff = Math.abs(windDir - (spot.coastOrientation ?? 270)) % 360
  return angleDiff > 180 ? 360 - angleDiff : angleDiff
}

/**
 * Direction quality + safety for wind sports (kite, windsurf, foil — and wing
 * when it lands). Cross-shore / side-onshore are ideal; pure onshore is
 * rideable but choppy; any offshore component drifts the rider out to sea
 * with gusty, holey wind near the beach — partial points + a note for
 * side-offshore, zero points; both cap the total nota (5,0 / 2,5 /10).
 */
/**
 * Água interior: a direcção não entra na nota. O factor é 1 (os pontos de
 * direcção ficam inteiros, como se a componente não existisse e o resto
 * fosse a escala toda), sem aviso de segurança nem tecto — o mesmo para
 * qualquer direcção do vento.
 */
export const WIND_DIR_FACTOR_AGUA_INTERIOR = 1

export function windSportDirectionSafety(
  spot: Pick<Spot, 'coastOrientation' | 'aguaInterior'>,
  windDir: number,
): WindSportDirectionSafety {
  if (spot.aguaInterior)
    return { direction: null, angleFromOnshore: null, dirFactor: WIND_DIR_FACTOR_AGUA_INTERIOR, safety: null, scoreCap: null }
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

// ─── Motor antigo: só SUP e wakeboard (#218, PR 6) ───
//
// Surf, kitesurf, windsurf, bodyboard e foil pontuam no motor v6
// (`notaUnica.notaHora` / o `notaV6` do pipeline). Aqui ficam só as duas
// modalidades sem definição v6 usável: o SUP (sem definição) e o wakeboard (a
// lógica `plana` do v6 só pontua spots de água plana curada, e nenhum dos
// spots de wake o é — decisão do Pedro, 27/10).

/** Modalidades que ainda pontuam no motor antigo. */
export type DesportoAntigo = 'sup' | 'wakeboard'


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

// ─── Helpers ───

export { SCORE_TIER_THRESHOLDS }

function getRatingLabels(score: number): { rating: string; ratingEn: string } {
  if (!(score > 0)) return { rating: 'N/A', ratingEn: 'N/A' }
  const tier = scoreTierFromScore(score)
  return { rating: getScoreTierLabel(tier, 'pt'), ratingEn: getScoreTierLabel(tier, 'en') }
}

// ─── Main Export ───

/** Score do motor antigo (só SUP e wakeboard; as outras modalidades estão no v6). */
export function getSportScore(spot: Spot, sport: DesportoAntigo, conditions: Conditions): SportScore {
  switch (sport) {
    case 'wakeboard': return scoreWakeboard(spot, conditions)
    case 'sup': return scoreSUP(spot, conditions)
    default: return { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], factorsEn: [], primaryFactor: 'N/A' }
  }
}

/** Calculate per-hour scores (motor antigo: SUP e wakeboard) from hourly forecast data.
 *  Missing fields in hourly fallback to currentConditions. */
export function getHourlyScores(
  spot: Spot,
  sport: DesportoAntigo,
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
