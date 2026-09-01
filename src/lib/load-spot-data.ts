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
import type { ObservedWave } from '@/lib/observedWave'
import { resolveConditionsEntry } from '@/lib/spotConditionsSource'
import { applyRegionalBiasFallback, rawToScoreInput } from '@/lib/scoreConditions'
import { loadWaveBiasRegionsBuild } from '@/lib/waveBias'
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
  return rawToScoreInput(raw as Record<string, unknown>)
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
    /** Measured wave — lets the UI show the «Corrigido pela boia X» badge (TopNow). */
    observedWave?: ObservedWave
    /** Regional bias meta — baked pela pipeline (VENTU_WAVE_BIAS_CORRECTION=1)
     *  ou aplicado em runtime pelo fallback client-side (`fallback: true`). */
    waveBias?: { region: string; me: number; n: number; deltaM: number; fallback?: boolean }
  }
  allScores: Record<SportType, SportScore>
  bestWindowToday: BestWindowToday | null
  bestWindowsBySport: BestWindowsBySport
}

function buildSpotData(
  spot: Spot,
  raw: RawConditions | null,
  forecastsData: Record<string, Array<Record<string, unknown>>>,
  waveBiasRegions: ReturnType<typeof loadWaveBiasRegionsBuild>,
): SpotData | null {
  const useLakeDefault = !raw && isWakeboardOnly(spot)
  if (!raw && !useLakeDefault) return null

  const scoreInput0 = raw ? toScoreInput(raw) : CALM_LAKE_CONDITIONS
  // Fallback do viés regional (wave-bias.json) — o mesmo gate da página de
  // spot: só quando a row NÃO traz o meta (pipeline sem
  // VENTU_WAVE_BIAS_CORRECTION=1) e não há leitura de boia fresca. O patch
  // corrige a altura usada no score E anexa o meta waveBias às conditions,
  // para o TopNow/mapa mostrarem o sufixo «(viés regional)» honestamente.
  const biasPatch = raw
    ? applyRegionalBiasFallback(raw, spot.region, waveBiasRegions)
    : null
  const scoreInput = biasPatch
    ? { ...scoreInput0, waveHeight: biasPatch.waveHeight }
    : scoreInput0
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
      observedWave: raw?.observedWave as ObservedWave | undefined,
      waveBias:
        (biasPatch?.waveBias ?? raw?.waveBias) as SpotData['conditions']['waveBias'],
    },
    allScores,
    bestWindowToday,
    bestWindowsBySport,
  }
}

// Build-time memoization: data files are immutable during a static build, so parse
// once per worker instead of once per page. loadSpotData() is called by home, spots
// index, mapa, explorar (255 pages) and modalidades (40 pages) — each call re-parses
// the ~8.2MB forecasts.json and recomputes scores for all 185 spots (~230ms).
// Only cached in production (build): dev must see freshly regenerated data files.
let spotDataCache: SpotData[] | null = null

export function loadSpotData(): SpotData[] {
  if (process.env.NODE_ENV === 'production' && spotDataCache) {
    return spotDataCache
  }

  const conditionsData = loadConditionsJson()
  const forecastsData = loadForecastsJson()
  const waveBiasRegions = loadWaveBiasRegionsBuild()

  const result: SpotData[] = []
  for (const spot of spots) {
    const raw = resolveConditionsEntry(spot, conditionsData) ?? null
    const row = buildSpotData(spot, raw, forecastsData, waveBiasRegions)
    if (row) result.push(row)
  }

  result.sort((a, b) => {
    const bestA = Math.max(...Object.values(a.allScores).map((s) => s.score), 0)
    const bestB = Math.max(...Object.values(b.allScores).map((s) => s.score), 0)
    return bestB - bestA
  })

  if (process.env.NODE_ENV === 'production') {
    spotDataCache = result
  }

  return result
}
