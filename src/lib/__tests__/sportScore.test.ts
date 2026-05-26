import { describe, it, expect } from 'vitest'
import { spots } from '@/lib/spots'
import {
  getSportScore,
  getAllSportScores,
  getHourlyScores,
  getRelevantSports,
  getScoreColor,
  getScoreTokens,
  SCORE_TIER_THRESHOLDS,
  type Conditions,
} from '@/lib/sportScore'
import { getCompatibleSports, TYPE_TO_SPORTS } from '@/lib/sportRatings'
import type { Spot } from '@/types'

function spotBySlug(slug: string): Spot {
  const spot = spots.find((s) => s.slug === slug)
  if (!spot) throw new Error(`Spot not found: ${slug}`)
  return spot
}

/** Convert knots to m/s (Open-Meteo uses m/s). */
function ktToMs(kt: number): number {
  return kt / 1.94384
}

const baseConditions: Conditions = {
  waveHeight: 1.0,
  wavePeriod: 10,
  waveDirection: 270,
  windSpeed: ktToMs(15),
  windDirection: 337,
  windGust: ktToMs(18),
  waterTemp: 18,
}

describe('getSportScore', () => {
  it('Guincho NNW offshore wind — kitesurf scores higher than surf', () => {
    const guincho = spotBySlug('guincho')
    const c: Conditions = {
      ...baseConditions,
      windSpeed: ktToMs(20),
      windDirection: 337,
      windGust: ktToMs(24),
      waveHeight: 0.8,
      wavePeriod: 9,
    }
    const kite = getSportScore(guincho, 'kitesurf', c)
    const surf = getSportScore(guincho, 'surf', c)
    expect(kite.score).toBeGreaterThan(70)
    expect(kite.score).toBeGreaterThan(surf.score)
    expect(kite.factors.some((f) => f.includes('kt'))).toBe(true)
  })

  it('Nazaré big swell — surf high, kitesurf penalised by large waves', () => {
    const nazare = spotBySlug('nazare')
    const c: Conditions = {
      ...baseConditions,
      waveHeight: 6,
      wavePeriod: 14,
      windSpeed: ktToMs(8),
      windDirection: 90,
    }
    const surf = getSportScore(nazare, 'surf', c)
    const kite = getSportScore(nazare, 'kitesurf', c)
    expect(surf.score).toBeGreaterThan(60)
    expect(surf.score).toBeGreaterThan(kite.score)
    expect(surf.factors.some((f) => f.includes('ondas'))).toBe(true)
  })

  it('Lagoa Albufeira flat water + moderate wind — foil and kite score well', () => {
    const lagoa = spotBySlug('foil-lagoa-albufeira')
    const c: Conditions = {
      ...baseConditions,
      waveHeight: 0.2,
      wavePeriod: 6,
      windSpeed: ktToMs(18),
      windDirection: 315,
    }
    const foil = getSportScore(lagoa, 'foil', c)
    const kite = getSportScore(lagoa, 'kitesurf', c)
    expect(foil.score).toBeGreaterThan(70)
    expect(kite.score).toBeGreaterThan(70)
    expect(foil.factors).toContain('Água plana')
  })

  it('Lagos Wake Park — wakeboard available regardless of weather', () => {
    const wake = spotBySlug('lagos-wakepark')
    const storm: Conditions = {
      ...baseConditions,
      waveHeight: 3,
      windSpeed: ktToMs(40),
    }
    const result = getSportScore(wake, 'wakeboard', storm)
    expect(result.score).toBe(80)
    expect(result.rating).toBe('Disponível')
    expect(result.factors).toContain('Cable park disponível')
  })

  it('Ocean surf spot without cable — wakeboard N/A', () => {
    const guincho = spotBySlug('guincho')
    const result = getSportScore(guincho, 'wakeboard', baseConditions)
    expect(result.score).toBe(0)
    expect(result.rating).toBe('N/A')
    expect(result.warning).toBeDefined()
  })

  it('SUP prefers flat water and light wind', () => {
    const spot = spotBySlug('foz-arelho')
    const flat: Conditions = {
      ...baseConditions,
      waveHeight: 0.3,
      windSpeed: ktToMs(8),
    }
    const choppy: Conditions = {
      ...baseConditions,
      waveHeight: 2.0,
      windSpeed: ktToMs(30),
    }
    expect(getSportScore(spot, 'sup', flat).score).toBeGreaterThan(
      getSportScore(spot, 'sup', choppy).score,
    )
  })

  it('Windsurf ideal range 15–28kt scores higher than light wind', () => {
    const guincho = spotBySlug('guincho')
    const ideal: Conditions = { ...baseConditions, windSpeed: ktToMs(20) }
    const light: Conditions = { ...baseConditions, windSpeed: ktToMs(8) }
    expect(getSportScore(guincho, 'windsurf', ideal).score).toBeGreaterThan(
      getSportScore(guincho, 'windsurf', light).score,
    )
  })

  it('Kitesurf warns on very strong wind', () => {
    const guincho = spotBySlug('guincho')
    const c: Conditions = { ...baseConditions, windSpeed: ktToMs(38), windGust: ktToMs(45) }
    const result = getSportScore(guincho, 'kitesurf', c)
    expect(result.warning).toContain('forte')
  })

  it('Kitesurf warns on weak wind', () => {
    const guincho = spotBySlug('guincho')
    const c: Conditions = { ...baseConditions, windSpeed: ktToMs(8) }
    const result = getSportScore(guincho, 'kitesurf', c)
    expect(result.warning).toContain('fraco')
  })

  it('Bodyboard scores with smaller waves than surf minimum', () => {
    const spot = spotBySlug('nazare')
    const c: Conditions = { ...baseConditions, waveHeight: 0.4, wavePeriod: 7 }
    const body = getSportScore(spot, 'bodyboard', c)
    expect(body.score).toBeGreaterThan(0)
    expect(body.factors.some((f) => f.includes('ondas'))).toBe(true)
  })

  it('Surf offshore wind scores higher than onshore at same speed', () => {
    const spot = spotBySlug('guincho')
    const offshore: Conditions = { ...baseConditions, windDirection: 90, windSpeed: ktToMs(12) }
    const onshore: Conditions = { ...baseConditions, windDirection: 270, windSpeed: ktToMs(12) }
    expect(getSportScore(spot, 'surf', offshore).score).toBeGreaterThan(
      getSportScore(spot, 'surf', onshore).score,
    )
  })

  it('Rating labels follow score thresholds', () => {
    const spot = spotBySlug('guincho')
    const epic: Conditions = {
      ...baseConditions,
      waveHeight: 2.5,
      wavePeriod: 12,
      windSpeed: ktToMs(5),
      windDirection: 90,
      waterTemp: 20,
    }
    const result = getSportScore(spot, 'surf', epic)
    expect(result.rating).toMatch(/Épico|Bom/)
    expect(result.ratingEn).toMatch(/Epic|Good/)
  })

  it('Unknown sport returns N/A', () => {
    const spot = spotBySlug('guincho')
    // @ts-expect-error testing invalid sport
    const result = getSportScore(spot, 'skateboard', baseConditions)
    expect(result.score).toBe(0)
    expect(result.rating).toBe('N/A')
  })
})

describe('getAllSportScores', () => {
  it('returns scores for every sport type', () => {
    const guincho = spotBySlug('guincho')
    const all = getAllSportScores(guincho, baseConditions)
    expect(Object.keys(all)).toEqual([
      'surf',
      'kitesurf',
      'windsurf',
      'wakeboard',
      'bodyboard',
      'sup',
      'foil',
    ])
    expect(all.kitesurf.score).toBeGreaterThan(0)
  })
})

describe('getHourlyScores', () => {
  it('maps hourly forecast rows to score arrays', () => {
    const spot = spotBySlug('guincho')
    const hourly = [
      { waveHeight: 1, wavePeriod: 10, windSpeed: ktToMs(20), windDirection: 337 },
      { waveHeight: 0.5, wavePeriod: 8, windSpeed: ktToMs(10), windDirection: 90 },
    ]
    const scores = getHourlyScores(spot, 'kitesurf', hourly, baseConditions)
    expect(scores).toHaveLength(2)
    expect(scores[0]).toBeGreaterThan(scores[1])
  })
})

describe('getRelevantSports', () => {
  it('includes compatibleSports and high-scoring sports', () => {
    const guincho = spotBySlug('guincho')
    const all = getAllSportScores(guincho, {
      ...baseConditions,
      windSpeed: ktToMs(22),
      waveHeight: 1.2,
    })
    const relevant = getRelevantSports(guincho, all)
    expect(relevant).toContain('kitesurf')
    expect(relevant).toContain('surf')
  })
})

describe('getScoreColor', () => {
  it('returns tier classes for score bands', () => {
    expect(getScoreColor(90).text).toContain('score-epic')
    expect(getScoreColor(75).text).toContain('score-good')
    expect(getScoreColor(55).text).toContain('score-fair')
    expect(getScoreColor(35).text).toContain('score-poor')
    expect(getScoreColor(10).text).toContain('score-closed')
  })
})

describe('getScoreTokens', () => {
  it('uses unified thresholds aligned with globals.css', () => {
    expect(getScoreTokens(80).tier).toBe('epic')
    expect(getScoreTokens(79).tier).toBe('good')
    expect(getScoreTokens(60).tier).toBe('good')
    expect(getScoreTokens(59).tier).toBe('fair')
    expect(getScoreTokens(40).tier).toBe('fair')
    expect(getScoreTokens(39).tier).toBe('poor')
    expect(getScoreTokens(20).tier).toBe('poor')
    expect(getScoreTokens(19).tier).toBe('closed')
  })

  it('exports documented threshold constants', () => {
    expect(SCORE_TIER_THRESHOLDS).toEqual({ epic: 80, good: 60, fair: 40, poor: 20 })
  })
})

describe('getCompatibleSports', () => {
  it('prefers explicit compatibleSports on Guincho', () => {
    const guincho = spotBySlug('guincho')
    expect(getCompatibleSports(guincho)).toEqual([
      'surf',
      'kitesurf',
      'windsurf',
      'foil',
      'sup',
      'bodyboard',
    ])
  })

  it('falls back to TYPE_TO_SPORTS when compatibleSports missing', () => {
    const spot: Spot = {
      id: 'test',
      slug: 'test',
      name: 'Test',
      nameEn: 'Test',
      region: 'Test',
      regionEn: 'Test',
      lat: 0,
      lon: 0,
      type: 'kitesurf',
      difficulty: 'beginner',
      bestWind: 'N',
      bestSwell: 'W',
      description: 'Test',
      descriptionEn: 'Test',
    }
    expect(getCompatibleSports(spot)).toEqual(TYPE_TO_SPORTS.kitesurf)
  })

  it('wakeboard spot uses explicit compatibleSports', () => {
    const wake = spotBySlug('lagos-wakepark')
    expect(getCompatibleSports(wake)).toEqual(['wakeboard'])
  })
})

describe('Representative conditions — surf bom', () => {
  it('surf ideal: 2m @ 12s with offshore wind and warm water', () => {
    // Guincho (coastOrientation=270), offshore wind from 90°, chest-high swell
    const guincho = spotBySlug('guincho')
    const c: Conditions = {
      waveHeight: 2.0,
      wavePeriod: 12,
      waveDirection: 270,
      windSpeed: ktToMs(10),
      windDirection: 90,
      windGust: ktToMs(12),
      waterTemp: 18,
    }
    const result = getSportScore(guincho, 'surf', c)
    // Offshore wind + decent waves should give a solid score
    expect(result.score).toBeGreaterThanOrEqual(60)
    expect(result.factors.some((f) => f.includes('ondas'))).toBe(true)
    expect(result.factors.some((f) => f.includes('período'))).toBe(true)
    expect(result.factors.some((f) => f.includes('offshore'))).toBe(true)
    expect(result.primaryFactor).toContain('2.0m')
  })
})

describe('Representative conditions — kite bom', () => {
  it('kite ideal: 20kt side-offshore wind, small waves, warm water', () => {
    // Guincho (coastOrientation=270)
    // Wind from 350° → |350-270|=80° → side-onshore
    // Let's use wind from 10° instead: |10-270|=260 → norm=100 → side-offshore
    const guincho = spotBySlug('guincho')
    const c: Conditions = {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(20),
      windDirection: 10,
      windGust: ktToMs(22),
      waterTemp: 18,
    }
    const result = getSportScore(guincho, 'kitesurf', c)
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.factors.some((f) => f.includes('kt'))).toBe(true)
    expect(result.factors.some((f) => f.includes('Ondas pequenas'))).toBe(true)
    expect(result.warning).toBeUndefined()
  })

  it('kite scores lower on onshore wind vs side-offshore (same speed)', () => {
    const guincho = spotBySlug('guincho')
    const sideOffshore: Conditions = {
      waveHeight: 0.5, wavePeriod: 8, waveDirection: 270,
      windSpeed: ktToMs(18), windDirection: 10, windGust: ktToMs(20), waterTemp: 18,
    }
    const onshore: Conditions = {
      waveHeight: 0.5, wavePeriod: 8, waveDirection: 270,
      windSpeed: ktToMs(18), windDirection: 270, windGust: ktToMs(20), waterTemp: 18,
    }
    const sideScore = getSportScore(guincho, 'kitesurf', sideOffshore).score
    const onScore = getSportScore(guincho, 'kitesurf', onshore).score
    expect(sideScore).toBeGreaterThan(onScore)
  })
})

describe('Representative conditions — SUP bom', () => {
  it('SUP ideal: flat water, light wind, warm', () => {
    const guincho = spotBySlug('guincho')
    const c: Conditions = {
      waveHeight: 0.2,
      wavePeriod: 5,
      waveDirection: 270,
      windSpeed: ktToMs(6),
      windDirection: 270,
      windGust: ktToMs(8),
      waterTemp: 20,
    }
    const result = getSportScore(guincho, 'sup', c)
    expect(result.score).toBeGreaterThanOrEqual(60)
    expect(result.factors.some((f) => f.includes('Água plana'))).toBe(true)
    expect(result.factors.some((f) => f.includes('Vento fraco'))).toBe(true)
    expect(result.factors.some((f) => f.includes('água'))).toBe(true)
  })

  it('SUP penalised by big waves and strong wind', () => {
    const guincho = spotBySlug('guincho')
    const bad: Conditions = {
      waveHeight: 2.5,
      wavePeriod: 10,
      waveDirection: 270,
      windSpeed: ktToMs(30),
      windDirection: 270,
      windGust: ktToMs(35),
      waterTemp: 14,
    }
    const result = getSportScore(guincho, 'sup', bad)
    expect(result.score).toBeLessThan(30)
  })
})
