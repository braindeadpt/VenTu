import { describe, it, expect } from 'vitest'
import { spots } from '@/lib/spots'
import {
  getSportScore,
  getHourlyScores,
  getRelevantSports,
  getScoreColor,
  getScoreTokens,
  SCORE_TIER_THRESHOLDS,
  type Conditions,
} from '@/lib/sportScore'
import { allScoresComV6 } from '@/lib/notaV6Agora'
import { getCompatibleSports, TYPE_TO_SPORTS } from '@/lib/sportRatings'
import type { Spot } from '@/types'
import { kt, v6 } from './motorV6Teste'

/*
 * Motor único (#218), PR 6: o `sportScore` só pontua SUP e wakeboard. Os
 * casos de surf, kitesurf, windsurf, bodyboard e foil deste ficheiro foram
 * PORTADOS para o motor v6 (`notaUnica.notaHora`, o caminho do site), numa
 * hora de dia (15/07 14:00). Onde o v6 dá outro número que o antigo, o teste
 * diz o número novo e porquê.
 */

function spotBySlug(slug: string): Spot {
  const spot = spots.find((s) => s.slug === slug)
  if (!spot) throw new Error(`Spot not found: ${slug}`)
  return spot
}

/** Convert knots to m/s (Open-Meteo uses m/s). */
const ktToMs = kt

const baseConditions: Conditions = {
  waveHeight: 1.0,
  wavePeriod: 10,
  waveDirection: 270,
  windSpeed: ktToMs(15),
  windDirection: 337,
  windGust: ktToMs(18),
  waterTemp: 18,
}

describe('getSportScore (motor antigo: SUP e wakeboard)', () => {
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
    expect(result.factors.some((f) => /cable|teleski|disponível/i.test(f))).toBe(true)
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
    const flat: Conditions = { ...baseConditions, waveHeight: 0.3, windSpeed: ktToMs(8) }
    const choppy: Conditions = { ...baseConditions, waveHeight: 2.0, windSpeed: ktToMs(30) }
    expect(getSportScore(spot, 'sup', flat).score).toBeGreaterThan(getSportScore(spot, 'sup', choppy).score)
  })

  it('SUP ideal: flat water, light wind, warm', () => {
    const guincho = spotBySlug('guincho')
    const c: Conditions = {
      waveHeight: 0.2, wavePeriod: 5, waveDirection: 270,
      windSpeed: ktToMs(6), windDirection: 270, windGust: ktToMs(8), waterTemp: 20,
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
      waveHeight: 2.5, wavePeriod: 10, waveDirection: 270,
      windSpeed: ktToMs(30), windDirection: 270, windGust: ktToMs(35), waterTemp: 14,
    }
    expect(getSportScore(guincho, 'sup', bad).score).toBeLessThan(30)
  })

  it('as modalidades v6 já não passam pelo motor antigo (N/A)', () => {
    const guincho = spotBySlug('guincho')
    for (const sport of ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'foil', 'skateboard']) {
      // @ts-expect-error o tipo só aceita 'sup' | 'wakeboard'
      const result = getSportScore(guincho, sport, baseConditions)
      expect(result.score).toBe(0)
      expect(result.rating).toBe('N/A')
    }
  })
})

describe('motor v6 — casos portados do sportScore antigo', () => {
  it('Guincho NNW 20 kt — kitesurf bem acima do surf', () => {
    const guincho = spotBySlug('guincho')
    const c: Conditions = { ...baseConditions, windSpeed: ktToMs(20), windGust: ktToMs(24), waveHeight: 0.8, wavePeriod: 9 }
    const kite = v6(guincho, 'kitesurf', c)
    const surf = v6(guincho, 'surf', c)
    expect(kite.score).toBeGreaterThanOrEqual(70)
    expect(kite.score).toBeGreaterThan(surf.score)
    expect(kite.factors.some((f) => f.includes('kt'))).toBe(true)
  })

  it('Nazaré 6 m @ 14 s — surf dá nota, kitesurf com 8 kt offshore não', () => {
    const nazare = spotBySlug('nazare')
    const c: Conditions = { ...baseConditions, waveHeight: 6, wavePeriod: 14, windSpeed: ktToMs(8), windDirection: 90 }
    const surf = v6(nazare, 'surf', c)
    const kite = v6(nazare, 'kitesurf', c)
    // antigo: surf > 60; v6: 5 · Dá (6 m é «grande» para o surf comum)
    expect(surf.nota).toBeGreaterThanOrEqual(4)
    expect(surf.score).toBeGreaterThan(kite.score)
    expect(kite.directionSafety).toBe('offshore')
    expect(surf.factors.some((f) => f.includes('ondas'))).toBe(true)
  })

  it('Lagoa de Albufeira água plana + 18 kt — foil e kite pontuam bem', () => {
    const lagoa = spotBySlug('foil-lagoa-albufeira')
    const c: Conditions = { ...baseConditions, waveHeight: 0.2, wavePeriod: 6, windSpeed: ktToMs(18), windDirection: 315 }
    const foil = v6(lagoa, 'foil', c)
    const kite = v6(lagoa, 'kitesurf', c)
    expect(foil.score).toBeGreaterThanOrEqual(70)
    expect(kite.score).toBeGreaterThanOrEqual(70)
    // o foil é a melhor das três vertentes (wing, kitefoil, surffoil)
    expect(foil.vertente).toBeDefined()
  })

  it('Windsurf 20 kt bem acima de 8 kt', () => {
    const guincho = spotBySlug('guincho')
    const ideal = v6(guincho, 'windsurf', { ...baseConditions, windSpeed: ktToMs(20) })
    const light = v6(guincho, 'windsurf', { ...baseConditions, windSpeed: ktToMs(8) })
    expect(ideal.score).toBeGreaterThan(light.score)
    expect(ideal.nota).toBeGreaterThanOrEqual(7)
  })

  it('Windsurf com 12 kt nunca chega a «Dá»', () => {
    const guincho = spotBySlug('guincho')
    const r = v6(guincho, 'windsurf', { ...baseConditions, windSpeed: ktToMs(12), windGust: ktToMs(14), waveHeight: 0.9 })
    expect(r.score).toBeLessThan(SCORE_TIER_THRESHOLDS.fair)
  })

  it('Kitesurf 14 kt: o v6 já dá «Dá» (o antigo ficava abaixo de Razoável)', () => {
    const guincho = spotBySlug('guincho')
    const r = v6(guincho, 'kitesurf', { ...baseConditions, windSpeed: ktToMs(14), windGust: ktToMs(15), waveHeight: 0.2 })
    expect(r.nota).toBe(5)
    expect(r.score).toBeLessThan(SCORE_TIER_THRESHOLDS.good)
  })

  it('Kitesurf 38 kt: «Só profissionais», nota baixa', () => {
    const guincho = spotBySlug('guincho')
    const r = v6(guincho, 'kitesurf', { ...baseConditions, windSpeed: ktToMs(38), windGust: ktToMs(45) })
    expect(r.soProfissionais).toBe(true)
    expect(r.score).toBeLessThan(SCORE_TIER_THRESHOLDS.fair)
  })

  it('Kitesurf com 8 kt ou 2 kt não dá', () => {
    expect(v6(spotBySlug('guincho'), 'kitesurf', { ...baseConditions, windSpeed: ktToMs(8) }).nota).toBe(0)
    const r = v6(spotBySlug('moledo'), 'kitesurf', { ...baseConditions, windSpeed: ktToMs(2), windGust: ktToMs(2.5), waveHeight: 0.9 })
    expect(r.nota).toBe(0)
    expect(r.rating).toBe('N/A')
  })

  it('Bodyboard e surf com 0,4 m @ 7 s: o v6 não dá nota a nenhum (o antigo dava ao bodyboard)', () => {
    const nazare = spotBySlug('nazare')
    const c: Conditions = { ...baseConditions, waveHeight: 0.4, wavePeriod: 7 }
    expect(v6(nazare, 'bodyboard', c).nota).toBe(0)
    expect(v6(nazare, 'surf', c).nota).toBe(0)
    expect(v6(nazare, 'bodyboard', c).factors.some((f) => f.includes('ondas'))).toBe(true)
  })

  it('Surf: vento de terra acima de vento de mar à mesma velocidade', () => {
    const spot = spotBySlug('guincho')
    const offshore = v6(spot, 'surf', { ...baseConditions, windDirection: 90, windSpeed: ktToMs(12) })
    const onshore = v6(spot, 'surf', { ...baseConditions, windDirection: 270, windSpeed: ktToMs(12) })
    expect(offshore.score).toBeGreaterThan(onshore.score)
  })

  it('Etiquetas pela banda da nota', () => {
    const r = v6(spotBySlug('guincho'), 'surf', {
      ...baseConditions, waveHeight: 2.5, wavePeriod: 12, windSpeed: ktToMs(5), windDirection: 90, waterTemp: 20,
    })
    expect(r.rating).toMatch(/Muito bom|Bom/)
    expect(r.ratingEn).toMatch(/Very good|Good/)
  })

  it('surf bom: 2 m @ 12 s com terral', () => {
    const r = v6(spotBySlug('guincho'), 'surf', {
      waveHeight: 2.0, wavePeriod: 12, waveDirection: 270,
      windSpeed: ktToMs(10), windDirection: 90, windGust: ktToMs(12), waterTemp: 18,
    })
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.factors.some((f) => f.includes('ondas'))).toBe(true)
    expect(r.factors.some((f) => f.includes('período'))).toBe(true)
    expect(r.primaryFactor).toContain('2.0m')
  })

  it('kite bom: 20 kt cruzado, ondas pequenas, sem aviso', () => {
    const r = v6(spotBySlug('guincho'), 'kitesurf', {
      waveHeight: 0.5, wavePeriod: 8, waveDirection: 270,
      windSpeed: ktToMs(20), windDirection: 10, windGust: ktToMs(22), waterTemp: 18,
    })
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.factors.some((f) => f.includes('kt'))).toBe(true)
    expect(r.factors.some((f) => f.includes('Ondas pequenas'))).toBe(true)
    expect(r.warning).toBeUndefined()
  })

  it('kite: vento de mar abaixo de cruzado (mesma velocidade)', () => {
    const c = { waveHeight: 0.5, wavePeriod: 8, waveDirection: 270, windSpeed: ktToMs(18), windGust: ktToMs(20), waterTemp: 18 }
    const guincho = spotBySlug('guincho')
    expect(v6(guincho, 'kitesurf', { ...c, windDirection: 10 }).score).toBeGreaterThan(
      v6(guincho, 'kitesurf', { ...c, windDirection: 270 }).score,
    )
  })

  it('condições a zero → surf sem nota', () => {
    const r = v6(spotBySlug('moledo'), 'surf', {
      waveHeight: 0, wavePeriod: 0, waveDirection: 0, windSpeed: 0, windDirection: 0, windGust: 0, waterTemp: 0,
    })
    expect(r.score).toBeLessThan(25)
  })

  it('surf ideal em Moledo (terral de E) ≥ 7', () => {
    const moledo = spotBySlug('moledo')
    expect(moledo.bestWind).toContain('E')
    const r = v6(moledo, 'surf', {
      waveHeight: 2, wavePeriod: 12, waveDirection: 270, windSpeed: 5, windDirection: 90, windGust: 7, waterTemp: 18,
    })
    expect(r.score).toBeGreaterThanOrEqual(70)
  })

  it('kite ~19 kt cruzado ≥ 7; o mesmo vento offshore leva o tecto e o aviso', () => {
    const moledo = spotBySlug('moledo')
    const ideal = { waveHeight: 1, wavePeriod: 8, waveDirection: 270, windSpeed: 10, windDirection: 0, windGust: 12, waterTemp: 18 }
    expect(v6(moledo, 'kitesurf', ideal).score).toBeGreaterThanOrEqual(70)
    const offshore = v6(moledo, 'kitesurf', { ...ideal, windDirection: 90 })
    expect(offshore.score).toBeLessThanOrEqual(25)
    expect(offshore.directionSafety).toBe('offshore')
  })

  it('de noite as modalidades v6 não têm nota', () => {
    const r = v6(spotBySlug('guincho'), 'surf', { ...baseConditions, waveHeight: 2, wavePeriod: 12 }, '2026-07-15T02:00')
    expect(r.noite).toBe(true)
    expect(r.score).toBe(0)
  })
})

describe('allScoresComV6 sem notaV6', () => {
  it('devolve as 7 modalidades: v6 «sem dados», SUP e wakeboard no antigo', () => {
    const guincho = spotBySlug('guincho')
    const all = allScoresComV6(guincho, baseConditions, null)
    expect(Object.keys(all).sort()).toEqual(['bodyboard', 'foil', 'kitesurf', 'sup', 'surf', 'wakeboard', 'windsurf'])
    expect(all.kitesurf.score).toBe(0)
    expect((all.kitesurf as { semDados?: true }).semDados).toBe(true)
    expect(all.sup.score).toBeGreaterThan(0)
  })
})

describe('getHourlyScores', () => {
  it('maps hourly forecast rows to score arrays (SUP)', () => {
    const spot = spotBySlug('guincho')
    const hourly = [
      { waveHeight: 0.3, wavePeriod: 5, windSpeed: ktToMs(5), windDirection: 337 },
      { waveHeight: 2, wavePeriod: 10, windSpeed: ktToMs(25), windDirection: 90 },
    ]
    const scores = getHourlyScores(spot, 'sup', hourly, baseConditions)
    expect(scores).toHaveLength(2)
    expect(scores[0]).toBeGreaterThan(scores[1])
  })
})

describe('getRelevantSports', () => {
  it('returns all compatible sports for the spot', () => {
    const guincho = spotBySlug('guincho')
    const relevant = getRelevantSports(guincho)
    expect(relevant).toContain('kitesurf')
    expect(relevant).toContain('surf')
    expect(relevant).toContain('foil')
  })

  it('returns foil only for foil-only spots', () => {
    const foilOnly = spotBySlug('marina-afurada-foil')
    if (!foilOnly) return
    expect(getRelevantSports(foilOnly)).toEqual(['foil'])
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
    expect(getScoreTokens(85).tier).toBe('epic')
    expect(getScoreTokens(84).tier).toBe('good')
    expect(getScoreTokens(65).tier).toBe('good')
    expect(getScoreTokens(64).tier).toBe('fair')
    expect(getScoreTokens(45).tier).toBe('fair')
    expect(getScoreTokens(44).tier).toBe('poor')
    expect(getScoreTokens(25).tier).toBe('poor')
    expect(getScoreTokens(24).tier).toBe('closed')
  })

  it('exports documented threshold constants', () => {
    expect(SCORE_TIER_THRESHOLDS).toEqual({ epic: 85, good: 65, fair: 45, poor: 25 })
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
      coastOrientation: 270,
      facilities: [],
      hazards: [],
    }
    expect(getCompatibleSports(spot)).toEqual(TYPE_TO_SPORTS.kitesurf)
  })

  it('wakeboard spot uses explicit compatibleSports', () => {
    const wake = spotBySlug('lagos-wakepark')
    expect(getCompatibleSports(wake)).toEqual(['wakeboard'])
  })
})
