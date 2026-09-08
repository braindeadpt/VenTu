/**
 * IH observed-tides layer status — for the About page. Mirrors the producer's
 * derivation (scripts/lib/dataLayerHealth.js, TIDES_MAX_AGE_HOURS = 24h):
 *   - 'ok'    — ih-tides.json fetched within the last 24 h;
 *   - 'stale' — the file exists but fetchedAt is older (the pipeline reuses
 *     the last known file — the outage lives HERE, visible);
 *   - 'down'  — missing file / invalid fetchedAt (first run).
 *
 * The pipeline records the same status + streak into pipeline-meta.json
 * (tideLayer) on every run, but fetch-ih-tides.js deliberately never blocks
 * the Open-Meteo pipeline (an IH tide outage ≠ forecasts stopped). This page
 * and the workflow logs are where the dead layer becomes visible.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TideLayerMeta } from '@/lib/pipelineMeta'

export type TideLayerStatus = 'ok' | 'stale' | 'down'

export interface TideLayerStatusInfo {
  status: TideLayerStatus
  /** Última fetch do ih-tides.json (a idade é o sinal de vida da camada). */
  fetchedAt?: string
  /** Nº de estações no último fetch conhecido. */
  stations: number
  /** Nº de spots mapeados à estação de maré mais próxima. */
  mappedSpots: number
  /** Runs consecutivas sem leituras novas (pipeline-meta tideLayer). */
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}

export interface TideFileLike {
  fetchedAt?: string
  stations?: Record<string, unknown>
  spotMapping?: Record<string, unknown>
}

/**
 * Pure derivation — testable without I/O. `meta` is the pipeline-meta
 * `tideLayer` block (streak/lastOkAt) merged into the result for the
 * downtime badge on the About card.
 */
export function deriveTideLayerStatus(
  file: TideFileLike | null | undefined,
  nowMs: number = Date.now(),
  meta: Pick<TideLayerMeta, 'streak' | 'lastStatus' | 'lastOkAt' | 'streakUpdatedAt'> | null | undefined = null,
): TideLayerStatusInfo {
  if (!file) return { status: 'down', stations: 0, mappedSpots: 0 }
  const fetchedAt = typeof file.fetchedAt === 'string' ? file.fetchedAt : undefined
  const ageHours = fetchedAt
    ? (nowMs - new Date(fetchedAt).getTime()) / 3_600_000
    : Infinity
  const status: TideLayerStatus =
    !fetchedAt || !Number.isFinite(ageHours) || ageHours < 0
      ? 'down'
      : ageHours <= 24
        ? 'ok'
        : 'stale'
  return {
    status,
    ...(fetchedAt ? { fetchedAt } : {}),
    stations: file.stations ? Object.keys(file.stations).length : 0,
    mappedSpots: file.spotMapping ? Object.keys(file.spotMapping).length : 0,
    ...(meta?.streak != null ? { streak: meta.streak } : {}),
    ...(meta?.lastStatus ? { lastStatus: meta.lastStatus } : {}),
    ...(meta?.lastOkAt ? { lastOkAt: meta.lastOkAt } : {}),
    ...(meta?.streakUpdatedAt ? { streakUpdatedAt: meta.streakUpdatedAt } : {}),
  }
}

/** Load from the committed pipeline output. Server-only (About page). */
export function loadTideLayerStatus(): TideLayerStatusInfo {
  if (typeof window !== 'undefined') return deriveTideLayerStatus(null)
  let file: TideFileLike | null = null
  try {
    const filePath = join(process.cwd(), 'public/data/ih-tides.json')
    if (existsSync(filePath)) {
      file = JSON.parse(readFileSync(filePath, 'utf-8')) as TideFileLike
    }
  } catch (e) {
    console.warn('Failed to load ih-tides.json:', e)
  }
  let meta: Pick<TideLayerMeta, 'streak' | 'lastStatus' | 'lastOkAt' | 'streakUpdatedAt'> | null = null
  try {
    const metaPath = join(process.cwd(), 'public/data/pipeline-meta.json')
    if (existsSync(metaPath)) {
      const l = (JSON.parse(readFileSync(metaPath, 'utf-8')) as { tideLayer?: TideLayerMeta | null })
        ?.tideLayer
      if (l) {
        meta = {
          ...(l.streak != null ? { streak: l.streak } : {}),
          ...(l.lastStatus ? { lastStatus: l.lastStatus } : {}),
          ...(l.lastOkAt ? { lastOkAt: l.lastOkAt } : {}),
          ...(l.streakUpdatedAt ? { streakUpdatedAt: l.streakUpdatedAt } : {}),
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load pipeline-meta.json (tide streak sub-state):', e)
  }
  return deriveTideLayerStatus(file, Date.now(), meta)
}
