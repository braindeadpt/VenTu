/**
 * IPMA radar layer status — PURE derivation (no I/O), shared by the server
 * loader (`radarLayerStatus.ts`, which adds the fs reads) and the client
 * `AboutDataCards` (which re-derives from fetched JSON under `ventu_live`)
 * and the `RadarCarousel` badge (age of the newest frame). Kept fs-free on
 * purpose so importing it from a client component never pulls
 * `pipelineMeta.ts` (fs at module scope) into the client bundle.
 *
 * Mirrors the producer's derivation (scripts/lib/dataLayerHealth.js,
 * RADAR_MAX_AGE_MINUTES = 25):
 *   - 'ok'    — the newest frame is ≤ 25 min old (IPMA publishes every 5 min);
 *   - 'stale' — the newest frame exists but is older (the pipeline keeps the
 *     last good file — the outage lives HERE, visible to the user);
 *   - 'down'  — no file / no valid frameTime (first run).
 */

/** Espelha o produtor (scripts/lib/dataLayerHealth.js) — frame ≤25 min é ok. */
export const RADAR_MAX_AGE_MINUTES = 25

export type RadarLayerStatus = 'ok' | 'stale' | 'down'

export interface RadarLayerStatusInfo {
  status: RadarLayerStatus
  /** Último frame válido (ISO, wall-clock de Lisboa com sufixo "Z"). */
  frameTime?: string
  /** Idade do último frame válido em minutos (presente com frameTime). */
  ageMin?: number
  /** Nº de frames no último radar.json (0 quando sem ficheiro/frames). */
  frames: number
  /** Runs consecutivas sem frames novos (pipeline-meta radarLayer). */
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}

export interface RadarFileLike {
  frameTime?: string
  frames?: Array<{ frameTime?: string }>
}

/** The pipeline-meta `radarLayer` fields the About card needs (streak window). */
export interface RadarLayerMetaLike {
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}

/**
 * Pure derivation — testable without I/O. `meta` is the pipeline-meta
 * `radarLayer` block (streak/lastOkAt) merged into the result for the
 * downtime badge on the About card.
 */
export function deriveRadarLayerStatus(
  file: RadarFileLike | null | undefined,
  nowMs: number = Date.now(),
  meta: RadarLayerMetaLike | null | undefined = null,
): RadarLayerStatusInfo {
  if (!file) return { status: 'down', frames: 0 }
  const frameTime =
    typeof file.frameTime === 'string'
      ? file.frameTime
      : typeof file.frames?.[0]?.frameTime === 'string'
        ? file.frames[0].frameTime
        : undefined
  const frames = Array.isArray(file.frames)
    ? file.frames.length
    : frameTime
      ? 1
      : 0
  if (!frameTime) return { status: 'down', frames }
  const ts = new Date(frameTime).getTime()
  if (!Number.isFinite(ts)) return { status: 'down', frames }
  const ageMin = (nowMs - ts) / 60_000
  const status: RadarLayerStatus = ageMin <= RADAR_MAX_AGE_MINUTES ? 'ok' : 'stale'
  const out: RadarLayerStatusInfo = { status, frameTime, ageMin, frames }
  if (meta) {
    if (typeof meta.streak === 'number') out.streak = meta.streak
    if (meta.lastStatus) out.lastStatus = meta.lastStatus
    if (meta.lastOkAt) out.lastOkAt = meta.lastOkAt
    if (meta.streakUpdatedAt) out.streakUpdatedAt = meta.streakUpdatedAt
  }
  return out
}

/** Idade de um frame em texto curto: "26m", "3h 05m", "1d 18h". */
export function formatRadarAge(ageMin: number): string {
  if (!Number.isFinite(ageMin)) return '0m'
  const m = Math.max(0, Math.floor(ageMin))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}