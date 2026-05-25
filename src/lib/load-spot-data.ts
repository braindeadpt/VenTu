import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spots } from '@/lib/spots'
import { getAllSportScores } from '@/lib/sportScore'
import type { SportType } from '@/lib/sportRatings'
import type { SportScore } from '@/lib/sportScore'
import type { MarineConditionsFields } from '@/lib/marineConditions'

export interface SpotData {
  spot: typeof spots[0]
  conditions: MarineConditionsFields
  allScores: Record<SportType, SportScore>
}

export function loadSpotData(): SpotData[] {
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
      const conditions = {
        waveHeight: cond.waveHeight || 0,
        wavePeriod: cond.wavePeriod || 0,
        waveDirection: cond.waveDirection || 0,
        windSpeed: cond.windSpeed || 0,
        windDirection: cond.windDirection || 0,
        windGust: cond.windGust || 0,
        waterTemp: cond.waterTemp || 0,
        swellHeight: cond.swellHeight,
        swellPeriod: cond.swellPeriod,
        wavePowerKw: cond.wavePowerKw,
        updatedAt: cond.updatedAt,
        source: 'real' as const,
      }
      const allScores = getAllSportScores(spot, conditions)
      result.push({ spot, conditions, allScores })
    }
  }

  result.sort((a, b) => (b.allScores['surf']?.score || 0) - (a.allScores['surf']?.score || 0))
  return result
}
