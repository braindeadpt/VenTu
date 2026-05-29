import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spots } from '@/lib/spots'
import { getAllSportScores } from '@/lib/sportScore'
import type { Spot } from '@/types'
import type { SportType } from '@/lib/sportRatings'
import type { SportScore } from '@/lib/sportScore'
import { pickConfidenceFields } from '@/lib/forecastConfidence'
import { resolveConditionsEntry } from '@/lib/spotConditionsSource'

const CALM_LAKE_CONDITIONS = {
  waveHeight: 0,
  wavePeriod: 0,
  waveDirection: 0,
  windSpeed: 0,
  windDirection: 0,
  windGust: 0,
  waterTemp: 18,
}

function isWakeboardOnly(spot: Spot): boolean {
  return (
    spot.type === 'wakeboard' ||
    (spot.compatibleSports?.length === 1 && spot.compatibleSports[0] === 'wakeboard')
  )
}

type RawConditions = Record<string, unknown>

function toScoreInput(raw: RawConditions) {
  return {
    waveHeight: Number(raw.waveHeight) || 0,
    wavePeriod: Number(raw.wavePeriod) || 0,
    waveDirection: Number(raw.waveDirection) || 0,
    windSpeed: Number(raw.windSpeed) || 0,
    windDirection: Number(raw.windDirection) || 0,
    windGust: Number(raw.windGust) || 0,
    waterTemp: Number(raw.waterTemp) || 0,
  }
}

function loadConditionsJson(): Record<string, RawConditions> {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'conditions.json')
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch { /* noop */ }
  return {}
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
    confidence?: import('@/lib/forecastConfidence').ConfidenceTier
    confidenceDetail?: import('@/lib/forecastConfidence').ConfidenceDetail
    dailyConfidence?: import('@/lib/forecastConfidence').DailyConfidence[]
  }
  allScores: Record<SportType, SportScore>
}

function buildSpotData(spot: Spot, raw: RawConditions | null): SpotData | null {
  const useLakeDefault = !raw && isWakeboardOnly(spot)
  if (!raw && !useLakeDefault) return null

  const scoreInput = raw ? toScoreInput(raw) : CALM_LAKE_CONDITIONS
  const allScores = getAllSportScores(spot, scoreInput)

  return {
    spot,
    conditions: {
      ...scoreInput,
      swellHeight: raw?.swellHeight != null ? Number(raw.swellHeight) : undefined,
      swellPeriod: raw?.swellPeriod != null ? Number(raw.swellPeriod) : undefined,
      wavePowerKw: raw?.wavePowerKw != null ? Number(raw.wavePowerKw) : undefined,
      updatedAt: (raw?.updatedAt as string) || undefined,
      source: raw ? ('real' as const) : ('mock' as const),
      ...(raw ? pickConfidenceFields(raw) : {}),
    },
    allScores,
  }
}

export function loadSpotData(): SpotData[] {
  const conditionsData = loadConditionsJson()

  const result: SpotData[] = []
  for (const spot of spots) {
    const raw = resolveConditionsEntry(spot, conditionsData) ?? null
    const row = buildSpotData(spot, raw)
    if (row) result.push(row)
  }

  result.sort((a, b) => {
    const bestA = Math.max(...Object.values(a.allScores).map((s) => s.score), 0)
    const bestB = Math.max(...Object.values(b.allScores).map((s) => s.score), 0)
    return bestB - bestA
  })

  return result
}
