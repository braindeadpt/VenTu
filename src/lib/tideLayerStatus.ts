/**
 * IH observed-tides layer status — for the About page. Mirrors the producer's
 * derivation (scripts/lib/dataLayerHealth.js, TIDES_MAX_AGE_HOURS = 24h).
 *
 * The pure derivation lives in `tideLayerStatusPure.ts` (fs-free, imported by
 * the client AboutDataCards under `ventu_live`); this module adds the fs
 * reads. The pipeline records the same status + streak into
 * pipeline-meta.json (tideLayer) on every run, but fetch-ih-tides.js
 * deliberately never blocks the Open-Meteo pipeline (an IH tide outage ≠
 * forecasts stopped). This page and the workflow logs are where the dead
 * layer becomes visible.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TideLayerMeta } from '@/lib/pipelineMeta'

export type {
  TideLayerStatus,
  TideLayerStatusInfo,
  TideFileLike,
  TideObservation,
} from '@/lib/tideLayerStatusPure'
export { deriveTideLayerStatus, latestTideObservations } from '@/lib/tideLayerStatusPure'
import {
  deriveTideLayerStatus,
  type TideLayerStatusInfo,
  type TideFileLike,
} from '@/lib/tideLayerStatusPure'

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