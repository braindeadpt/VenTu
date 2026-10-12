import { describe, it, expect } from 'vitest'
import {
  getSportScore,
  windQualityTier,
  windSportDirectionSafety,
  WIND_SPORT_OFFSHORE_SCORE_CAP,
  type Conditions,
} from '@/lib/sportScore'
import { getTranslation } from '@/lib/i18n'
import { scoreBand } from '@/lib/verdict/scoreBand'
import type { Spot } from '@/types'

/** Mock com orientação fixa (#179): não depende dos valores de spots.ts. */
const MOCK_SPOT: Spot = {
  id: 'mock-west',
  slug: 'mock-west',
  name: 'Praia Teste',
  nameEn: 'Test Beach',
  region: 'Teste',
  regionEn: 'Test',
  lat: 38.7,
  lon: -9.4,
  type: 'kitesurf',
  difficulty: 'intermediate',
  bestWind: 'N',
  bestSwell: 'W',
  coastOrientation: 270,
  description: '',
  descriptionEn: '',
  facilities: [],
  hazards: [],
}

const KT = 1 / 1.94384

/** 20 kt limpos: rajada baixa, mar pequeno, água amena. */
function clean20kt(windDirection: number): Conditions {
  return {
    waveHeight: 0.5,
    wavePeriod: 8,
    waveDirection: 270,
    windSpeed: 20 * KT,
    windDirection,
    windGust: 22 * KT,
    waterTemp: 18,
  }
}

const DIRS = {
  onshore: [270],
  sideOnshore: [315, 225],
  cross: [0, 180],
  sideOffshore: [45, 135],
  offshore: [90],
} as const

const PT = getTranslation('pt').windSafety
const EN = getTranslation('en').windSafety

describe('windSportDirectionSafety — bandas (costa a 270°)', () => {
  it('classifica onshore / side-onshore / cross / side-offshore / offshore', () => {
    for (const d of DIRS.onshore) expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('onshore')
    for (const d of DIRS.sideOnshore) expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('side-onshore')
    for (const d of DIRS.cross) expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('cross-shore')
    for (const d of DIRS.sideOffshore) expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('side-offshore')
    for (const d of DIRS.offshore) expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('offshore')
  })

  it('cross-shore cobre ~70–100° do onshore; só offshore tem cap', () => {
    expect(windSportDirectionSafety(MOCK_SPOT, 270 + 70).direction).toBe('cross-shore')
    expect(windSportDirectionSafety(MOCK_SPOT, 270 - 100).direction).toBe('cross-shore')
    expect(windSportDirectionSafety(MOCK_SPOT, 90).scoreCap).toBe(WIND_SPORT_OFFSHORE_SCORE_CAP)
    expect(windSportDirectionSafety(MOCK_SPOT, 45).scoreCap).toBeNull()
    expect(windSportDirectionSafety(MOCK_SPOT, 0).safety).toBeNull()
  })
})

describe.each(['kitesurf', 'windsurf', 'foil'] as const)('%s a 20 kt limpos', (sport) => {
  const score = (dir: number) => getSportScore(MOCK_SPOT, sport, clean20kt(dir))
  const minOf = (dirs: readonly number[]) => Math.min(...dirs.map((d) => score(d).score))
  const maxOf = (dirs: readonly number[]) => Math.max(...dirs.map((d) => score(d).score))

  it('ordem: cross ≥ side-on > onshore > side-off > offshore', () => {
    expect(minOf(DIRS.cross)).toBeGreaterThanOrEqual(maxOf(DIRS.sideOnshore))
    expect(minOf(DIRS.sideOnshore)).toBeGreaterThan(maxOf(DIRS.onshore))
    expect(minOf(DIRS.onshore)).toBeGreaterThan(maxOf(DIRS.sideOffshore))
    expect(minOf(DIRS.sideOffshore)).toBeGreaterThan(maxOf(DIRS.offshore))
  })

  it('cross-shore = máximo da direcção, sem aviso', () => {
    const cross = score(0)
    for (const d of [270, 315, 225, 45, 135, 90]) {
      expect(cross.score).toBeGreaterThanOrEqual(score(d).score)
    }
    expect(cross.directionSafety).toBeUndefined()
  })

  it('offshore → score ≤ 25 (FLAT) com aviso de deriva PT/EN', () => {
    const off = score(90)
    expect(off.score).toBeLessThanOrEqual(25)
    expect(['poor', 'closed']).toContain(scoreBand(off.score).key) // FLAT/FECHADO
    expect(off.directionSafety).toBe('offshore')
    expect(off.warning).toBe('Vento offshore: perigo de deriva para o mar')
    expect(off.warningEn).toBe(EN.offshore)
  })

  it('side-offshore → menos que cross-shore e com aviso «só avançados»', () => {
    for (const d of DIRS.sideOffshore) {
      const so = score(d)
      expect(so.score).toBeLessThan(score(0).score)
      expect(so.directionSafety).toBe('side-offshore')
      expect(so.warning).toBe('Componente offshore: só avançados com barco de apoio')
      expect(so.warningEn).toBe(EN.sideOffshore)
    }
  })

  it('cap offshore também com vento marginal', () => {
    const light = getSportScore(MOCK_SPOT, sport, { ...clean20kt(90), windSpeed: 13 * KT, windGust: 14 * KT })
    expect(light.score).toBeLessThanOrEqual(WIND_SPORT_OFFSHORE_SCORE_CAP)
    expect(light.directionSafety).toBe('offshore')
  })
})

describe('desportos de onda não herdam o aviso', () => {
  it('surf offshore continua bom e sem directionSafety', () => {
    const surf = getSportScore(MOCK_SPOT, 'surf', { ...clean20kt(90), waveHeight: 1.5, wavePeriod: 12, windSpeed: 8 * KT })
    expect(surf.directionSafety).toBeUndefined()
  })
})

describe('windQualityTier (tingimento da relação vento/costa)', () => {
  it('desportos de vento: cross/side-on bons, onshore razoável, offshore mau', () => {
    expect(windQualityTier(MOCK_SPOT, 0, 'kitesurf')).toBe('good')
    expect(windQualityTier(MOCK_SPOT, 315, 'windsurf')).toBe('good')
    expect(windQualityTier(MOCK_SPOT, 270, 'foil')).toBe('fair')
    expect(windQualityTier(MOCK_SPOT, 45, 'kitesurf')).toBe('poor')
    expect(windQualityTier(MOCK_SPOT, 90, 'kitesurf')).toBe('poor')
  })

  it('PT é a língua primária das mensagens', () => {
    expect(PT.offshore).toBe('Vento offshore: perigo de deriva para o mar')
    expect(PT.sideOffshore).toBe('Componente offshore: só avançados com barco de apoio')
  })
})
