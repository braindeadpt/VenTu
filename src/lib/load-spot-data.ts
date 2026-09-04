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
import type { ObservedWave, ObservedWaveMeta } from '@/lib/observedWave'
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
    /** Runner-up source (WMO when IH won, IH when WMO won). */
    observedWaveAlt?: ObservedWave
    /** Why the winner was chosen (freshness/distance). */
    observedWaveMeta?: ObservedWaveMeta
    /** Recusa cross-border: leitura ES descartada por par ES×PT incoherent. */
    observedWaveCoherenceRefused?: { esCode: string; day?: string | null }
    /** Confiança baixa da leitura IH: par ES×PT incoherent há N+ dias consecutivos. */
    observedWaveCoherenceWarning?: {
      esCode: string
      ptRefCode?: string
      days: number
      firstDay?: string | null
      lastDay?: string | null
    }
    /** Station wind bias baked by the merge (wind-bias.json) — badge tooltip. */
    windBias?: { station?: string; source?: string; me?: number; mae?: number; rmse?: number; n?: number }
    tideHeight?: number
    tideStatus?: 'high' | 'low' | 'rising' | 'falling'
    tideLabel?: string
    /** Regional bias meta — baked pela pipeline (VENTU_WAVE_BIAS_CORRECTION=1)
     *  ou aplicado em runtime pelo fallback client-side (`fallback: true`). */
    waveBias?: { region: string; me: number; n: number; deltaM: number; fallback?: boolean }
  }
  allScores: Record<SportType, SportScore>
  /**
   * Hourly forecast rows for this spot (same array the client fetch serves).
   * Detail rows only: `loadSpotData()` attaches it for the spot-page bake;
   * `loadSpotListings()` rows omit it — listing pages render a card and would
   * otherwise pay ~10 MB of serialized forecast across ~300 static pages.
   */
  forecast?: Array<{
    time: string
    waveHeight?: number
    wavePeriod?: number
    windSpeed?: number
    windDirection?: number
    windGust?: number
    waterTemp?: number
  }>
  bestWindowToday: BestWindowToday | null
  bestWindowsBySport: BestWindowsBySport
}

/**
 * Build one spot row. `detail` rows serve the spot page (which bakes them into
 * the static HTML — see src/app/[locale]/spots/[slug]/page.tsx) and therefore
 * carry the full conditions incl. observed-source coherence, station wind bias
 * and tide context, plus the hourly forecast. Listing rows skip exactly those
 * fields — they were added to this shared loader for the spot-page bake in
 * 847350f9c, and no listing component reads them.
 */
function buildSpotData(
  spot: Spot,
  raw: RawConditions | null,
  forecastsData: Record<string, Array<Record<string, unknown>>>,
  waveBiasRegions: ReturnType<typeof loadWaveBiasRegionsBuild>,
  detail: boolean,
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

  const conditions: SpotData['conditions'] = {
    ...scoreInput,
    ...pickMarineDisplayFields((raw ?? {}) as Record<string, unknown>),
    updatedAt: (raw?.updatedAt as string) || undefined,
    source: raw ? ('real' as const) : ('mock' as const),
    ...(raw ? pickConfidenceFields(raw) : {}),
    observed: raw ? pickObservedField(raw as Record<string, unknown>) : undefined,
    observedWave: raw?.observedWave as ObservedWave | undefined,
    ...(detail
      ? {
          observedWaveAlt: raw?.observedWaveAlt as ObservedWave | undefined,
          observedWaveMeta: raw?.observedWaveMeta as ObservedWaveMeta | undefined,
          observedWaveCoherenceRefused: raw?.observedWaveCoherenceRefused as
            | SpotData['conditions']['observedWaveCoherenceRefused']
            | undefined,
          observedWaveCoherenceWarning: raw?.observedWaveCoherenceWarning as
            | SpotData['conditions']['observedWaveCoherenceWarning']
            | undefined,
          windBias: raw?.windBias as SpotData['conditions']['windBias'],
          tideHeight: raw?.tideHeight as number | undefined,
          tideStatus: raw?.tideStatus as SpotData['conditions']['tideStatus'],
          tideLabel: raw?.tideLabel as string | undefined,
        }
      : {}),
    waveBias:
      (biasPatch?.waveBias ?? raw?.waveBias) as SpotData['conditions']['waveBias'],
  }

  const dataId = spot.conditionsSource ?? spot.id
  const forecast = (forecastsData[dataId] ?? forecastsData[spot.id] ?? []) as NonNullable<SpotData['forecast']>
  const { bestWindowToday, bestWindowsBySport } = computeBestWindowsForSpot(spot, forecast)

  const row: SpotData = {
    spot,
    conditions,
    allScores,
    bestWindowToday,
    bestWindowsBySport,
  }
  if (detail) {
    row.forecast = forecast
  }
  return row
}

// Build-time memoization: data files are immutable during a static build, so parse
// once per worker instead of once per page. loadSpotData()/loadSpotListings() are
// called by home, spots index, mapa, explorar (255 pages) and modalidades (40
// pages) — each call re-parses the ~8.2MB forecasts.json and recomputes scores for
// all 185 spots (~230ms). Only cached in production (build): dev must see freshly
// regenerated data files.
let listingCache: SpotData[] | null = null
let detailCache: SpotData[] | null = null

function loadRows(detail: boolean): SpotData[] {
  if (process.env.NODE_ENV === 'production') {
    const cached = detail ? detailCache : listingCache
    if (cached) return cached
  }

  const conditionsData = loadConditionsJson()
  const forecastsData = loadForecastsJson()
  const waveBiasRegions = loadWaveBiasRegionsBuild()

  const result: SpotData[] = []
  for (const spot of spots) {
    const raw = resolveConditionsEntry(spot, conditionsData) ?? null
    const row = buildSpotData(spot, raw, forecastsData, waveBiasRegions, detail)
    if (row) result.push(row)
  }

  result.sort((a, b) => {
    const bestA = Math.max(...Object.values(a.allScores).map((s) => s.score), 0)
    const bestB = Math.max(...Object.values(b.allScores).map((s) => s.score), 0)
    return bestB - bestA
  })

  if (process.env.NODE_ENV === 'production') {
    if (detail) {
      detailCache = result
    } else {
      listingCache = result
    }
  }

  return result
}

/** Detail rows (full conditions + forecast) — the spot page bakes one into its HTML. */
export function loadSpotData(): SpotData[] {
  return loadRows(true)
}

/** Lean rows for card/grid/map listings — no forecast, no spot-page-only condition fields. */
export function loadSpotListings(): SpotData[] {
  return loadRows(false)
}
