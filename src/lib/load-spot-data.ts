import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spots } from '@/lib/spots'
import { getAllSportScores } from '@/lib/sportScore'
import type { Spot } from '@/types'
import type { SportType } from '@/lib/sportRatings'
import type { SportScore } from '@/lib/sportScore'

interface SpotsIndexEntry {
  id: string
  slug: string
  name: string
  nameEn: string
  region: string
  regionEn: string
  lat: number
  lon: number
  coastOrientation: number
  type: string
  difficulty: string
  compatibleSports: string[]
  description: string
  descriptionEn: string
  facilities: string[]
  hazards: string[]
  blueFlag?: boolean
  accessibleBeach?: boolean
  conditions: {
    waveHeight: number
    wavePeriod: number
    waveDirection: number
    windSpeed: number
    windDirection: number
    windGust: number
    waterTemp: number
    updatedAt?: string
  } | null
  allScores: Record<string, {
    score: number
    rating: string
    ratingEn: string
    factors: string[]
    warning?: string
    primaryFactor: string
  }> | null
  bestScore: number
}

export interface SpotData {
  spot: Spot
  conditions: {
    waveHeight: number
    wavePeriod: number
    waveDirection: number
    windSpeed: number
    windDirection: number
    windGust: number
    waterTemp: number
    swellHeight?: number
    swellPeriod?: number
    wavePowerKw?: number
    updatedAt?: string
    source?: 'real' | 'mock'
  }
  allScores: Record<SportType, SportScore>
}

let cachedIndex: SpotsIndexEntry[] | null = null

function loadIndex(): SpotsIndexEntry[] {
  if (cachedIndex) return cachedIndex
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'spots-index.json')
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      cachedIndex = raw.spots || raw
      return cachedIndex!
    }
  } catch { /* fall through */ }
  return []
}

export function loadSpotData(): SpotData[] {
  const index = loadIndex()
  if (index.length > 0) {
    const result = index
      .filter((entry) => entry.conditions && entry.allScores)
      .map((entry) => {
        const spot = spots.find((s) => s.id === entry.id)
        if (!spot) return null
        return {
          spot,
          conditions: {
            waveHeight: entry.conditions!.waveHeight,
            wavePeriod: entry.conditions!.wavePeriod,
            waveDirection: entry.conditions!.waveDirection,
            windSpeed: entry.conditions!.windSpeed,
            windDirection: entry.conditions!.windDirection,
            windGust: entry.conditions!.windGust,
            waterTemp: entry.conditions!.waterTemp,
            updatedAt: entry.conditions!.updatedAt,
            source: 'real' as const,
          },
          allScores: entry.allScores as unknown as Record<SportType, SportScore>,
        } as SpotData
      })
      .filter(Boolean) as SpotData[]
    result.sort((a, b) => (b.allScores.surf?.score || 0) - (a.allScores.surf?.score || 0))
    return result
  }

  // Fallback: read conditions.json + compute scores at render time
  let conditionsData: Record<string, any> = {}
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'conditions.json')
    if (existsSync(filePath)) {
      conditionsData = JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch { /* noop */ }

  const result: SpotData[] = []
  for (const spot of spots) {
    const cond = conditionsData[spot.id]
    if (cond) {
      result.push({
        spot,
        conditions: {
          waveHeight: cond.waveHeight || 0,
          wavePeriod: cond.wavePeriod || 0,
          waveDirection: cond.waveDirection || 0,
          windSpeed: cond.windSpeed || 0,
          windDirection: cond.windDirection || 0,
          windGust: cond.windGust || 0,
          waterTemp: cond.waterTemp || 0,
          updatedAt: cond.updatedAt,
          source: 'real' as const,
        },
        allScores: getAllSportScores(spot, {
          waveHeight: cond.waveHeight || 0,
          wavePeriod: cond.wavePeriod || 0,
          waveDirection: cond.waveDirection || 0,
          windSpeed: cond.windSpeed || 0,
          windDirection: cond.windDirection || 0,
          windGust: cond.windGust || 0,
          waterTemp: cond.waterTemp || 0,
        }),
      })
    }
  }
  result.sort((a, b) => (b.allScores?.surf?.score || 0) - (a.allScores?.surf?.score || 0))
  return result
}
