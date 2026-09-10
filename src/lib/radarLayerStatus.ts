/**
 * IPMA radar layer status — for the About page. Mirrors the producer's
 * derivation (scripts/lib/dataLayerHealth.js, RADAR_MAX_AGE_MINUTES = 25).
 *
 * The pure derivation lives in `radarLayerStatusPure.ts` (fs-free, imported
 * by the client AboutDataCards under `ventu_live` and the RadarCarousel
 * badge); this module adds the fs reads. The pipeline records the same
 * status + streak into pipeline-meta.json (radarLayer) on every run, but the
 * radar layer is deliberately warn-only (an IPMA radar outage ≠ forecasts
 * stopped — decision f92cf42ea). This page and the workflow logs are where
 * the dead layer becomes visible.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RadarLayerMeta } from '@/lib/pipelineMeta'

export type {
  RadarLayerStatus,
  RadarLayerStatusInfo,
  RadarFileLike,
} from '@/lib/radarLayerStatusPure'
export { deriveRadarLayerStatus, formatRadarAge, RADAR_MAX_AGE_MINUTES } from '@/lib/radarLayerStatusPure'
import {
  deriveRadarLayerStatus,
  type RadarFileLike,
  type RadarLayerStatusInfo,
} from '@/lib/radarLayerStatusPure'

/** Load from the committed pipeline output. Server-only (About page). */
export function loadRadarLayerStatus(): RadarLayerStatusInfo {
  if (typeof window !== 'undefined') return deriveRadarLayerStatus(null)
  let file: RadarFileLike | null = null
  try {
    const filePath = join(process.cwd(), 'public/data/radar.json')
    if (existsSync(filePath)) {
      file = JSON.parse(readFileSync(filePath, 'utf-8')) as RadarFileLike
    }
  } catch (e) {
    console.warn('Failed to load radar.json:', e)
  }
  let meta: Pick<RadarLayerMeta, 'streak' | 'lastStatus' | 'lastOkAt' | 'streakUpdatedAt'> | null = null
  try {
    const metaPath = join(process.cwd(), 'public/data/pipeline-meta.json')
    if (existsSync(metaPath)) {
      const l = (JSON.parse(readFileSync(metaPath, 'utf-8')) as { radarLayer?: RadarLayerMeta | null })
        ?.radarLayer
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
    console.warn('Failed to load pipeline-meta.json (radar streak sub-state):', e)
  }
  return deriveRadarLayerStatus(file, Date.now(), meta)
}