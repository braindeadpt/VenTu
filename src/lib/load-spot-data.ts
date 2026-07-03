import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spots } from '@/lib/spots'
import { getAllSportScores } from '@/lib/sportScore'
import type { Spot } from '@/types'
import type { SportType } from '@/lib/sportRatings'
import type { SportScore } from '@/lib/sportScore'
import { pickConfidenceFields } from '@/lib/forecastConfidence'
import { pickMarineDisplayFields, pickObservedField } from '@/lib/marineConditions'
import type { ObservedConditions } from '@/lib/observations'
import { resolveConditionsEntry } from '@/lib/spotConditionsSource'
import type { BestWindowToday, BestWindowsBySport } from '@/lib/bestWindowToday'
import { computeBestWindowsForSpot } from '@/lib/bestWindowToday'

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

function loadForecastsJson(): Record<string, Array<Record<string, unknown>>> {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'forecasts.json')
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch { /* noop */ }
  return {}
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
    swellDirection?: number
    secondarySwellHeight?: number
    secondarySwellPeriod?: number
    secondarySwellDirection?: number
    wavePowerKw?: number
    updatedAt?: string
    source?: 'real' | 'mock'
    confidence?: import('@/lib/forecastConfidence').ConfidenceTier
    confidenceDetail?: import('@/lib/forecastConfidence').ConfidenceDetail
    dailyConfidence?: import('@/lib/forecastConfidence').DailyConfidence[]
    observed?: ObservedConditions
  }
  allScores: Record<SportType, SportScore>
  bestWindowToday: BestWindowToday | null
  bestWindowsBySport: BestWindowsBySport
}

function buildSpotData(
  spot: Spot,
  raw: RawConditions | null,
  forecastsData: Record<string, Array<Record<string, unknown>>>,
): SpotData | null {
  const useLakeDefault = !raw && isWakeboardOnly(spot)
  if (!raw && !useLakeDefault) return null

  const scoreInput = raw ? toScoreInput(raw) : CALM_LAKE_CONDITIONS
  const allScores = getAllSportScores(spot, scoreInput)

  const dataId = spot.conditionsSource ?? spot.id
  const forecast = (forecastsData[dataId] ?? forecastsData[spot.id] ?? []) as Array<{
    time: string
    waveHeight?: number
    wavePeriod?: number
    windSpeed?: number
    windDirection?: number
    windGust?: number
    waterTemp?: number
  }>
  const { bestWindowToday, bestWindowsBySport } = computeBestWindowsForSpot(spot, forecast)

  return {
    spot,
    conditions: {
      ...scoreInput,
      ...pickMarineDisplayFields((raw ?? {}) as Record<string, unknown>),
      updatedAt: (raw?.updatedAt as string) || undefined,
      source: raw ? ('real' as const) : ('mock' as const),
      ...(raw ? pickConfidenceFields(raw) : {}),
      observed: raw ? pickObservedField(raw as Record<string, unknown>) : undefined,
    },
    allScores,
    bestWindowToday,
    bestWindowsBySport,
  }
}

export function loadSpotData(): SpotData[] {
  const conditionsData = loadConditionsJson()
  const forecastsData = loadForecastsJson()

  const result: SpotData[] = []
  for (const spot of spots) {
    const raw = resolveConditionsEntry(spot, conditionsData) ?? null
    const row = buildSpotData(spot, raw, forecastsData)
    if (row) result.push(row)
  }

  result.sort((a, b) => {
    const bestA = Math.max(...Object.values(a.allScores).map((s) => s.score), 0)
    const bestB = Math.max(...Object.values(b.allScores).map((s) => s.score), 0)
    return bestB - bestA
  })

  return result
}
