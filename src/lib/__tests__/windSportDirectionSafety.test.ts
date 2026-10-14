import { describe, it, expect } from 'vitest'
import {
  getSportScore,
  windQualityTier,
  windSportDirectionSafety,
  WIND_SPORT_OFFSHORE_SCORE_CAP,
  WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP,
  type Conditions,
} from '@/lib/sportScore'
import { getSpotScoreFactors } from '@/lib/spotScoreFactors'
import { scoreToNota } from '@/lib/nota'
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

/** Nota /10 sem arredondar (os caps da #210 estão em /10). */
const notaOf = (s: { score: number }) => s.score / 10

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

  it('cross-shore cobre ~70–100° do onshore; offshore e side-offshore têm cap', () => {
    expect(windSportDirectionSafety(MOCK_SPOT, 270 + 70).direction).toBe('cross-shore')
    expect(windSportDirectionSafety(MOCK_SPOT, 270 - 100).direction).toBe('cross-shore')
    expect(windSportDirectionSafety(MOCK_SPOT, 90).scoreCap).toBe(WIND_SPORT_OFFSHORE_SCORE_CAP)
    // #195/#210: side-offshore deixou de ser null — cap 5,0/10; offshore 2,5/10.
    expect(WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP).toBe(5)
    expect(WIND_SPORT_OFFSHORE_SCORE_CAP).toBe(2.5)
    expect(windSportDirectionSafety(MOCK_SPOT, 45).scoreCap).toBe(WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP)
    expect(windSportDirectionSafety(MOCK_SPOT, 135).scoreCap).toBe(WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP)
    for (const d of [...DIRS.onshore, ...DIRS.sideOnshore, ...DIRS.cross]) {
      expect(windSportDirectionSafety(MOCK_SPOT, d).scoreCap).toBeNull()
    }
    expect(windSportDirectionSafety(MOCK_SPOT, 0).safety).toBeNull()
  })
})

describe.each(['kitesurf', 'windsurf', 'foil'] as const)('%s a 20 kt limpos', (sport) => {
  const score = (dir: number) => getSportScore(MOCK_SPOT, sport, clean20kt(dir))
  const minOf = (dirs: readonly number[]) => Math.min(...dirs.map((d) => notaOf(score(d))))
  const maxOf = (dirs: readonly number[]) => Math.max(...dirs.map((d) => notaOf(score(d))))

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

  it('offshore → nota ≤ 2,5/10 (Fraco/Não dá) com aviso de deriva PT/EN', () => {
    const off = score(90)
    expect(notaOf(off)).toBeLessThanOrEqual(2.5)
    expect(scoreToNota(off.score)).toBeLessThanOrEqual(3)
    expect(['poor', 'closed']).toContain(scoreBand(off.score).key) // Fraco/Não dá
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
    expect(notaOf(light)).toBeLessThanOrEqual(WIND_SPORT_OFFSHORE_SCORE_CAP)
    expect(light.directionSafety).toBe('offshore')
  })
})

/** 25 kt limpos — o caso da #195 (antes: side-offshore chegava a ~70–80). */
function clean25kt(windDirection: number): Conditions {
  return { ...clean20kt(windDirection), windSpeed: 25 * KT, windGust: 27 * KT }
}

describe.each(['kitesurf', 'windsurf', 'foil'] as const)('%s a 25 kt limpos (#195)', (sport) => {
  const score = (dir: number) => getSportScore(MOCK_SPOT, sport, clean25kt(dir))

  it('side-offshore a 45° e a 135° → nota ≤ 5,0/10 (nunca Bom/Muito bom), com o aviso actual', () => {
    for (const d of DIRS.sideOffshore) {
      const so = score(d)
      expect(notaOf(so)).toBeLessThanOrEqual(5.0)
      expect(scoreToNota(so.score)).toBeLessThanOrEqual(5)
      expect(['good', 'epic']).not.toContain(scoreBand(so.score).key)
      expect(so.directionSafety).toBe('side-offshore')
      expect(so.warning).toBe(PT.sideOffshore)
      expect(so.warningEn).toBe(EN.sideOffshore)
    }
  })

  it('cross-shore continua > 5,0/10', () => {
    for (const d of DIRS.cross) expect(notaOf(score(d))).toBeGreaterThan(5.0)
  })

  it('ordem: cross ≥ side-on > onshore > side-off > offshore', () => {
    const minOf = (dirs: readonly number[]) => Math.min(...dirs.map((d) => notaOf(score(d))))
    const maxOf = (dirs: readonly number[]) => Math.max(...dirs.map((d) => notaOf(score(d))))
    expect(minOf(DIRS.cross)).toBeGreaterThanOrEqual(maxOf(DIRS.sideOnshore))
    expect(minOf(DIRS.sideOnshore)).toBeGreaterThan(maxOf(DIRS.onshore))
    expect(minOf(DIRS.onshore)).toBeGreaterThan(maxOf(DIRS.sideOffshore))
    expect(minOf(DIRS.sideOffshore)).toBeGreaterThan(maxOf(DIRS.offshore))
  })
})

describe('label de direcção alinhada com o score (#195)', () => {
  // 80° do onshore (costa a 270°): vento de 350° ou de 190°. O classifyWind
  // chama-lhe side-onshore (41–90°); a banda dos desportos de vento, cross-shore.
  const AT_80_FROM_ONSHORE = [270 + 80 - 360, 270 - 80] as const

  it.each(['kitesurf', 'windsurf', 'foil'] as const)('%s: factor de direcção diz cross-shore', (sport) => {
    for (const d of AT_80_FROM_ONSHORE) {
      expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('cross-shore')
      const s = getSportScore(MOCK_SPOT, sport, clean20kt(d))
      expect(s.factorsEn).toContain('cross-shore')
      expect(s.factorsEn).not.toContain('side-onshore')
    }
  })

  it.each(['kitesurf', 'windsurf', 'foil'] as const)('%s: linha «porquê» usa o termo cross das traduções', (sport) => {
    const c = { ...clean20kt(350), swellDirection: undefined }
    const allScores = Object.fromEntries(
      (['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const)
        .map((sp) => [sp, getSportScore(MOCK_SPOT, sp, c)]),
    ) as Parameters<typeof getSpotScoreFactors>[0]['allScores']
    const wind = (locale: string) =>
      getSpotScoreFactors({ spot: MOCK_SPOT, conditions: c, allScores, sport, locale })
        .find((f) => f.kind === 'wind')
    expect(wind('pt')?.label).toBe('Cross 20 kt')
    expect(wind('en')?.label).toBe('Cross-shore 20 kt')
  })

  it('surf mantém o classifyWind (side-onshore → Cross-on)', () => {
    const c = { ...clean20kt(350), waveHeight: 1.5, wavePeriod: 12, windSpeed: 8 * KT, windGust: 9 * KT }
    const allScores = Object.fromEntries(
      (['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const)
        .map((sp) => [sp, getSportScore(MOCK_SPOT, sp, c)]),
    ) as Parameters<typeof getSpotScoreFactors>[0]['allScores']
    const segs = getSpotScoreFactors({ spot: MOCK_SPOT, conditions: c, allScores, sport: 'surf', locale: 'pt' })
    const wind = segs.find((f) => f.kind === 'wind')
    if (wind) expect(wind.label).toBe('Cross-on 8 kt')
    expect(getSportScore(MOCK_SPOT, 'surf', c).factorsEn).not.toContain('cross-shore')
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
