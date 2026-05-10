// Sport-Specific Scoring System
// Each sport has its own criteria — NO mixed generic score

import { Spot } from '@/types'
import { SportType } from './sportRatings'

export interface Conditions {
  waveHeight: number
  wavePeriod: number
  waveDirection: number
  windSpeed: number        // km/h
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

// ─── Sport Scoring Logic ───

function scoreSurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  // Wave height (0-40 pts)
  const waveScore = Math.min(c.waveHeight * 15, 40)
  score += waveScore
  if (c.waveHeight > 0.5) factors.push(`${c.waveHeight.toFixed(1)}m ondas`)

  // Wave period (0-20 pts)
  const periodScore = Math.min((c.wavePeriod - 5) * 3, 20)
  score += Math.max(0, periodScore)
  if (c.wavePeriod > 8) factors.push(`${c.wavePeriod.toFixed(0)}s período`)

  // Wind direction — offshore is good for surf (0-25 pts)
  // coastOrientation = direction the beach faces (0=N, 90=E, 180=S, 270=W)
  // offshore = wind blowing FROM land TO sea = |windDir - coastOrientation| > 90
  const angleDiff = Math.abs(c.windDirection - (spot.coastOrientation || 270))
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff
  const isOffshore = normalizedDiff > 90
  const windScore = isOffshore ? Math.max(0, 25 - c.windSpeed * 0.5) : Math.max(0, 15 - c.windSpeed * 0.3)
  score += windScore
  if (isOffshore) factors.push('Vento offshore')
  else if (c.windSpeed < 10) factors.push('Vento fraco')

  // Water temp (0-15 pts) — bonus
  score += Math.min(c.waterTemp * 0.5, 15)

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

  // Wind speed is KING for kitesurf (0-60 pts)
  const windKt = c.windSpeed * 1.94384
  let windScore = 0
  if (windKt >= 15 && windKt <= 30) {
    windScore = 60
    factors.push(`${windKt.toFixed(0)}kt vento`)
  } else if (windKt > 30) {
    windScore = 50
    factors.push(`${windKt.toFixed(0)}kt vento forte`)
  } else if (windKt >= 10) {
    windScore = windKt * 2
    factors.push(`${windKt.toFixed(0)}kt vento`)
  }
  score += windScore

  // Wind gusts consistency (0-15 pts)
  const gustDiff = c.windGust - c.windSpeed
  score += gustDiff < 10 ? 15 : gustDiff < 20 ? 10 : 5

  // Small waves = good for kite (0-15 pts)
  if (c.waveHeight < 1.5) {
    score += 15
    factors.push('Ondas pequenas')
  } else if (c.waveHeight < 2.5) {
    score += 8
  }

  // Water temp (0-10 pts)
  score += Math.min(c.waterTemp * 0.3, 10)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    warning: windKt > 35 ? 'Vento muito forte — apenas avançados' : windKt < 12 ? 'Vento fraco — precisa de kite grande' : undefined,
    primaryFactor: `${windKt.toFixed(0)}kt`,
  }
}

function scoreWindsurf(spot: Spot, c: Conditions): SportScore {
  const factors: string[] = []
  let score = 0

  // Wind speed (0-55 pts) — windsurf likes 15-25kt
  const windKt = c.windSpeed * 1.94384
  if (windKt >= 15 && windKt <= 28) {
    score += 55
    factors.push(`${windKt.toFixed(0)}kt vento`)
  } else if (windKt >= 10) {
    score += windKt * 2
    factors.push(`${windKt.toFixed(0)}kt vento`)
  }

  // Wave height — windsurf can handle bigger waves than kite (0-20 pts)
  if (c.waveHeight > 1 && c.waveHeight < 3) {
    score += 20
    factors.push(`${c.waveHeight.toFixed(1)}m ondas`)
  } else if (c.waveHeight < 4) {
    score += 10
  }

  // Wind direction — sideshore ideal (0-15 pts)
  score += 15  // Simplified

  // Water temp (0-10 pts)
  score += Math.min(c.waterTemp * 0.3, 10)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    primaryFactor: `${windKt.toFixed(0)}kt`,
  }
}

function scoreWakeboard(spot: Spot, c: Conditions): SportScore {
  // Wakeboard depends on cable park, NOT weather
  // Check if spot has wakeboard facilities or is a cable park
  const hasCablePark = spot.facilities?.some(f => 
    f.toLowerCase().includes('cable') || 
    f.toLowerCase().includes('wake') ||
    f.toLowerCase().includes('lagoa')
  ) || spot.type === 'wakeboard'

  if (!hasCablePark) {
    return {
      score: 0,
      rating: 'N/A',
      ratingEn: 'N/A',
      factors: ['Sem cable park'],
      warning: 'Este spot não tem infraestrutura para wakeboard',
      primaryFactor: 'N/A',
    }
  }

  return {
    score: 80,  // If it has cable park, it's always "good" weather-wise
    rating: 'Disponível',
    ratingEn: 'Available',
    factors: ['Cable park disponível'],
    primaryFactor: 'Cable Park',
  }
}

function scoreBodyboard(spot: Spot, c: Conditions): SportScore {
  // Similar to surf but smaller waves are fine
  const factors: string[] = []
  let score = 0

  // Wave height — bodyboard works with smaller waves (0-45 pts)
  const waveScore = Math.min(c.waveHeight * 18, 45)
  score += waveScore
  if (c.waveHeight > 0.3) factors.push(`${c.waveHeight.toFixed(1)}m ondas`)

  // Period (0-20 pts)
  score += Math.min((c.wavePeriod - 4) * 3, 20)
  if (c.wavePeriod > 6) factors.push(`${c.wavePeriod.toFixed(0)}s período`)

  // Wind (0-25 pts)
  score += Math.max(0, 25 - c.windSpeed * 0.4)

  // Water temp (0-10 pts)
  score += Math.min(c.waterTemp * 0.4, 10)

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

  // SUP likes flat or small waves (0-40 pts)
  if (c.waveHeight < 0.5) {
    score += 40
    factors.push('Água plana')
  } else if (c.waveHeight < 1) {
    score += 30
    factors.push('Ondas pequenas')
  } else if (c.waveHeight < 1.5) {
    score += 15
  }

  // Light wind (0-30 pts)
  if (c.windSpeed < 15) {
    score += 30
    factors.push('Vento fraco')
  } else if (c.windSpeed < 25) {
    score += 15
  }

  // Water temp (0-20 pts)
  score += Math.min(c.waterTemp * 0.6, 20)
  if (c.waterTemp > 15) factors.push(`${c.waterTemp.toFixed(0)}°C água`)

  // Wave period (0-10 pts)
  score += Math.max(0, 10 - c.wavePeriod * 0.5)

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    ...getRatingLabels(score),
    factors,
    primaryFactor: c.waveHeight < 0.5 ? 'Plano' : `${c.waveHeight.toFixed(1)}m`,
  }
}

// ─── Helpers ───

function getRatingLabels(score: number): { rating: string; ratingEn: string } {
  if (score >= 85) return { rating: 'Épico!', ratingEn: 'Epic!' }
  if (score >= 70) return { rating: 'Bom', ratingEn: 'Good' }
  if (score >= 50) return { rating: 'Razoável', ratingEn: 'Fair' }
  if (score >= 30) return { rating: 'Fraco', ratingEn: 'Poor' }
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
    default: return { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: 'N/A' }
  }
}

// Get all sport scores for a spot
export function getAllSportScores(spot: Spot, conditions: Conditions): Record<SportType, SportScore> {
  return {
    surf: getSportScore(spot, 'surf', conditions),
    kitesurf: getSportScore(spot, 'kitesurf', conditions),
    windsurf: getSportScore(spot, 'windsurf', conditions),
    wakeboard: getSportScore(spot, 'wakeboard', conditions),
    bodyboard: getSportScore(spot, 'bodyboard', conditions),
    sup: getSportScore(spot, 'sup', conditions),
  }
}

// Color for score (reused from surfability)
export function getScoreColor(score: number) {
  if (score >= 85) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' }
  if (score >= 70) return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'shadow-cyan-500/20' }
  if (score >= 50) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-amber-500/20' }
  if (score >= 30) return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', glow: 'shadow-orange-500/20' }
  return { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', glow: 'shadow-slate-500/20' }
}

// Get sports that are relevant for this spot (score > 0 or primary sport)
export function getRelevantSports(spot: Spot, allScores: Record<SportType, SportScore>): SportType[] {
  const relevant: SportType[] = []
  
  // Primary sports always shown
  let primary: SportType[] = []
  if (spot.compatibleSports && Array.isArray(spot.compatibleSports)) {
    primary = spot.compatibleSports as SportType[]
  }
  
  // Also show sports with score > 30
  (Object.keys(allScores) as SportType[]).forEach(sport => {
    if (primary.includes(sport) || allScores[sport].score > 30) {
      relevant.push(sport)
    }
  })
  
  // Remove duplicates
  const unique = relevant.filter((item, index) => relevant.indexOf(item) === index)
  return unique
}
