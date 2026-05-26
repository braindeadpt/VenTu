import { describe, it, expect } from 'vitest'
import { onCount, marginalCount, top3, alternativeSport, getScoreSport } from '../spotGridSelectors'
import type { GridSpotData } from '@/lib/gridSpotFilters'
import type { SportType, GridSportFilter } from '@/lib/sportRatings'
import type { Spot } from '@/types'

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'test-spot',
    slug: 'test-spot',
    name: 'Test Spot',
    nameEn: 'Test Spot',
    region: 'Lisboa',
    regionEn: 'Lisbon',
    lat: 38.7,
    lon: -9.4,
    type: 'surf',
    difficulty: 'intermediate',
    bestWind: 'N',
    bestSwell: 'NW',
    description: '',
    descriptionEn: '',
    facilities: [],
    hazards: [],
    coastOrientation: 270,
    compatibleSports: ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'foil'],
    ...overrides,
  }
}

function makeData(
  id: string,
  region: string,
  scores: Partial<Record<SportType, number>>,
): GridSpotData {
  const allScores: Record<SportType, { score: number; rating: string; ratingEn: string; factors: string[]; primaryFactor: string }> = {
    surf: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
    kitesurf: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
    windsurf: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
    wakeboard: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
    bodyboard: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
    sup: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
    foil: { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], primaryFactor: '' },
  }
  for (const [sport, score] of Object.entries(scores)) {
    if (allScores[sport as SportType]) {
      allScores[sport as SportType] = { score, rating: 'Bom', ratingEn: 'Good', factors: [], primaryFactor: '' }
    }
  }
  return {
    spot: makeSpot({ id, region }),
    conditions: {
      waveHeight: 1,
      wavePeriod: 10,
      waveDirection: 270,
      windSpeed: 5,
      windDirection: 180,
      windGust: 8,
      waterTemp: 16,
    },
    allScores,
  }
}

describe('getScoreSport', () => {
  it('returns null for all', () => {
    expect(getScoreSport('all')).toBeNull()
  })

  it('returns surf for big-wave', () => {
    expect(getScoreSport('big-wave')).toBe('surf')
  })

  it('returns the same sport for direct sports', () => {
    expect(getScoreSport('kitesurf')).toBe('kitesurf')
    expect(getScoreSport('surf')).toBe('surf')
    expect(getScoreSport('windsurf')).toBe('windsurf')
  })
})

describe('onCount', () => {
  it('counts spots with score >= 70', () => {
    const spots = [
      makeData('a', 'Todos', { surf: 80 }),
      makeData('b', 'Todos', { surf: 50 }),
      makeData('c', 'Todos', { surf: 90 }),
    ]
    expect(onCount(spots, 'surf')).toBe(2)
  })

  it('uses max score when sport is all', () => {
    const spots = [
      makeData('a', 'Todos', { surf: 80, kitesurf: 30 }),
      makeData('b', 'Todos', { surf: 30, kitesurf: 70 }),
      makeData('c', 'Todos', { surf: 20, kitesurf: 20 }),
    ]
    expect(onCount(spots, 'all')).toBe(2)
  })

  it('returns 0 when no spots qualify', () => {
    const spots = [
      makeData('a', 'Todos', { surf: 30 }),
    ]
    expect(onCount(spots, 'surf')).toBe(0)
  })
})

describe('marginalCount', () => {
  it('counts spots with score between 40 and 70', () => {
    const spots = [
      makeData('a', 'Todos', { surf: 80 }),
      makeData('b', 'Todos', { surf: 50 }),
      makeData('c', 'Todos', { surf: 35 }),
    ]
    expect(marginalCount(spots, 'surf')).toBe(1)
  })

  it('excludes scores below 40 and >= 70', () => {
    const spots = [
      makeData('a', 'Todos', { surf: 30 }),
      makeData('b', 'Todos', { surf: 40 }),
      makeData('c', 'Todos', { surf: 69 }),
      makeData('d', 'Todos', { surf: 70 }),
    ]
    expect(marginalCount(spots, 'surf')).toBe(2)
  })
})

describe('top3', () => {
  it('returns empty for all sport', () => {
    const spots = [makeData('a', 'Todos', { surf: 80 })]
    expect(top3(spots, 'all')).toEqual([])
  })

  it('takes first 3 playable from already-sorted input', () => {
    const sorted = [
      makeData('d', 'Todos', { surf: 90 }),
      makeData('b', 'Todos', { surf: 80 }),
      makeData('a', 'Todos', { surf: 50 }),
      makeData('c', 'Todos', { surf: 20 }),
    ]
    const result = top3(sorted, 'surf')
    expect(result).toHaveLength(3)
    expect(result[0].spot.id).toBe('d')
    expect(result[1].spot.id).toBe('b')
    expect(result[2].spot.id).toBe('a')
  })

  it('only includes spots with score >= 30', () => {
    const spots = [
      makeData('a', 'Todos', { surf: 50 }),
      makeData('b', 'Todos', { surf: 29 }),
      makeData('c', 'Todos', { surf: 40 }),
    ]
    const result = top3(spots, 'surf')
    expect(result).toHaveLength(2)
  })
})

describe('alternativeSport', () => {
  it('returns null for all sport', () => {
    expect(alternativeSport([], 'all', 'Todos')).toBeNull()
  })

  it('returns null for big-wave', () => {
    expect(alternativeSport([], 'big-wave', 'Todos')).toBeNull()
  })

  it('returns the most common alternative sport in the region', () => {
    const spots = [
      makeData('a', 'Algarve', { kitesurf: 60, windsurf: 80 }),
      makeData('b', 'Algarve', { kitesurf: 70, windsurf: 30 }),
      makeData('c', 'Algarve', { windsurf: 70 }),
    ]
    // For surfs current sport, kitesurf has 2 playable spots, windsurf has 2
    // windsurf appears in all 3 (a:80, b:30=fails, c:70) -> actually b fails windsurf (30 < 30)
    // Let me re-check: b has windsurf 30, threshold is 30, so it IS playable
    // So windsurf has a:80, b:30, c:70 = 3 playable
    // kitesurf has a:60, b:70 = 2 playable
    const result = alternativeSport(spots, 'surf', 'Algarve')
    expect(result).toBe('windsurf')
  })

  it('returns null when no alternative sport has playable conditions', () => {
    const spots = [
      makeData('a', 'Algarve', { surf: 80, kitesurf: 20 }),
    ]
    expect(alternativeSport(spots, 'surf', 'Algarve')).toBeNull()
  })

  it('only counts spots in the given region', () => {
    const spots = [
      makeData('a', 'Algarve', { kitesurf: 60 }),
      makeData('b', 'Lisboa', { kitesurf: 70 }),
    ]
    // Only spot a is in Algarve, so only 1 playable kitesurf spot
    const result = alternativeSport(spots, 'surf', 'Algarve')
    expect(result).toBe('kitesurf')
  })
})
