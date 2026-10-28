import { describe, it, expect } from 'vitest'
import {
  getSportScore,
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
import type { SportType } from '@/lib/sportRatings'
import { v6 } from './motorV6Teste'

/*
 * Motor único (#218), PR 6: os casos por modalidade de vento foram portados
 * do `sportScore` antigo para o motor v6 (`notaHora`, hora de dia). O v6 tem
 * a sua relação vento/praia (`ventoRel`: 30/65/110/150°) e o tecto de
 * segurança desta banda (`windSportDirectionSafety`, 40/69/100/140°) por cima.
 */

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

/** Nota v6 de uma modalidade de vento sobre o MOCK_SPOT (formato `SportScore`). */
const v6Mock = (sport: SportType, c: Conditions) => v6(MOCK_SPOT, sport, c)

describe.each(['kitesurf', 'windsurf', 'foil'] as const)('%s a 20 kt limpos (v6)', (sport) => {
  const score = (dir: number) => v6Mock(sport, clean20kt(dir))
  const minOf = (dirs: readonly number[]) => Math.min(...dirs.map((d) => notaOf(score(d))))
  const maxOf = (dirs: readonly number[]) => Math.max(...dirs.map((d) => notaOf(score(d))))
  const melhor = () => Math.max(minOf(DIRS.cross), minOf(DIRS.sideOnshore))

  it('ordem: cross / side-on > onshore > side-off; offshore no fundo (kite e windsurf)', () => {
    // o v6 prefere o lateral de mar (side-on) ao cruzado no windsurf e no foil; o antigo punha o cross à frente
    expect(melhor()).toBeGreaterThan(maxOf(DIRS.onshore))
    expect(minOf(DIRS.onshore)).toBeGreaterThan(maxOf(DIRS.sideOffshore))
    if (sport !== 'foil') expect(minOf(DIRS.sideOffshore)).toBeGreaterThan(maxOf(DIRS.offshore))
  })

  it('cross-shore sem aviso e ≥ 7', () => {
    const cross = score(0)
    expect(cross.directionSafety).toBeUndefined()
    expect(cross.nota).toBeGreaterThanOrEqual(7)
  })

  it('side-offshore → menos que cross-shore e com aviso «só avançados»', () => {
    for (const d of DIRS.sideOffshore) {
      const so = score(d)
      expect(so.score).toBeLessThan(score(0).score)
      expect(notaOf(so)).toBeLessThanOrEqual(WIND_SPORT_SIDE_OFFSHORE_SCORE_CAP)
      expect(so.directionSafety).toBe('side-offshore')
      expect(so.warning).toBe('Componente offshore: só avançados com barco de apoio')
      expect(so.warningEn).toBe(EN.sideOffshore)
    }
  })
})

describe.each(['kitesurf', 'windsurf'] as const)('%s offshore (v6)', (sport) => {
  it('offshore → nota ≤ 2,5/10 (Fraco/Não dá) com aviso de deriva PT/EN', () => {
    const off = v6Mock(sport, clean20kt(90))
    expect(notaOf(off)).toBeLessThanOrEqual(WIND_SPORT_OFFSHORE_SCORE_CAP)
    expect(scoreToNota(off.score)).toBeLessThanOrEqual(3)
    expect(['poor', 'closed']).toContain(scoreBand(off.score).key)
    expect(off.directionSafety).toBe('offshore')
    expect(off.warning).toBe('Vento offshore: perigo de deriva para o mar')
    expect(off.warningEn).toBe(EN.offshore)
  })

  it('tecto offshore também com vento marginal', () => {
    const light = v6Mock(sport, { ...clean20kt(90), windSpeed: 13 * KT, windGust: 14 * KT })
    expect(notaOf(light)).toBeLessThanOrEqual(WIND_SPORT_OFFSHORE_SCORE_CAP)
  })
})

describe('foil offshore (melhor das três vertentes, decisão de 27/10)', () => {
  it('wing e kitefoil levam o tecto offshore; ganha o surffoil (onda), sem aviso de vento', () => {
    const off = v6Mock('foil', clean20kt(90))
    expect(off.vertente).toBe('surffoil')
    expect(off.directionSafety).toBeUndefined()
    // o surffoil não tem tecto de vento: a nota sai da onda (0,5 m @ 8 s)
    expect(off.nota).toBeLessThanOrEqual(5)
  })

  it('com vento cruzado ganha uma vertente de vento', () => {
    expect(['wing', 'kitefoil']).toContain(v6Mock('foil', clean20kt(0)).vertente)
    expect(v6Mock('foil', { ...clean20kt(0), windSpeed: 13 * KT, windGust: 14 * KT }).vertente).toBe('kitefoil')
  })
})

/** 25 kt limpos — o caso da #195 (antes: side-offshore chegava a ~70–80). */
function clean25kt(windDirection: number): Conditions {
  return { ...clean20kt(windDirection), windSpeed: 25 * KT, windGust: 27 * KT }
}

describe.each(['kitesurf', 'windsurf', 'foil'] as const)('%s a 25 kt limpos (#195, v6)', (sport) => {
  const score = (dir: number) => v6Mock(sport, clean25kt(dir))

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
})

/** allScores do site para uma linha: v6 nas modalidades v6, motor antigo no SUP e no wakeboard. */
function allScoresV6(c: Conditions) {
  return Object.fromEntries(
    (['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const).map((sp) => [
      sp,
      sp === 'sup' || sp === 'wakeboard' ? getSportScore(MOCK_SPOT, sp, c) : v6Mock(sp, c),
    ]),
  ) as Parameters<typeof getSpotScoreFactors>[0]['allScores']
}

describe('label de direcção alinhada com o score (#195)', () => {
  // 80° do onshore (costa a 270°): vento de 350° ou de 190°. O classifyWind
  // chama-lhe side-onshore (41–90°); a banda dos desportos de vento, cross-shore.
  const AT_80_FROM_ONSHORE = [270 + 80 - 360, 270 - 80] as const

  it.each(['kitesurf', 'windsurf', 'foil'] as const)('%s: factor de direcção diz cross-shore', (sport) => {
    for (const d of AT_80_FROM_ONSHORE) {
      expect(windSportDirectionSafety(MOCK_SPOT, d).direction).toBe('cross-shore')
      const s = v6Mock(sport, clean20kt(d))
      expect(s.factorsEn).toContain('cross-shore')
      expect(s.factorsEn).not.toContain('side-onshore')
    }
  })

  it.each(['kitesurf', 'windsurf', 'foil'] as const)('%s: linha «porquê» usa o termo cross das traduções', (sport) => {
    const c = { ...clean20kt(350), swellDirection: undefined }
    const allScores = allScoresV6(c)
    const wind = (locale: string) =>
      getSpotScoreFactors({ spot: MOCK_SPOT, conditions: c, allScores, sport, locale })
        .find((f) => f.kind === 'wind')
    expect(wind('pt')?.label).toBe('Cross 20 kt')
    expect(wind('en')?.label).toBe('Cross-shore 20 kt')
  })

  it('surf mantém o classifyWind (side-onshore → Cross-on)', () => {
    const c = { ...clean20kt(350), waveHeight: 1.5, wavePeriod: 12, windSpeed: 8 * KT, windGust: 9 * KT }
    const segs = getSpotScoreFactors({ spot: MOCK_SPOT, conditions: c, allScores: allScoresV6(c), sport: 'surf', locale: 'pt' })
    const wind = segs.find((f) => f.kind === 'wind')
    if (wind) expect(wind.label).toBe('Cross-on 8 kt')
    expect(v6Mock('surf', c).factorsEn).not.toContain('cross-shore')
  })
})

describe('desportos de onda não herdam o aviso', () => {
  it('surf com terral continua bom e sem directionSafety', () => {
    const surf = v6Mock('surf', { ...clean20kt(90), waveHeight: 1.5, wavePeriod: 12, windSpeed: 8 * KT })
    expect(surf.directionSafety).toBeUndefined()
    expect(surf.nota).toBeGreaterThanOrEqual(7)
  })
})

describe('mensagens', () => {
  it('PT é a língua primária das mensagens', () => {
    expect(PT.offshore).toBe('Vento offshore: perigo de deriva para o mar')
    expect(PT.sideOffshore).toBe('Componente offshore: só avançados com barco de apoio')
  })
})
