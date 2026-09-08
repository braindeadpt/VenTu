/**
 * IH observed-tides layer status — PURE derivation (no I/O), shared by the
 * server loader (`tideLayerStatus.ts`, which adds the fs reads) and the
 * client `AboutDataCards` (which re-derives from fetched JSON under
 * `ventu_live`). Kept fs-free on purpose so importing it from a client
 * component never pulls `pipelineMeta.ts` (fs at module scope) into the
 * client bundle.
 *
 * Mirrors the producer's derivation (scripts/lib/dataLayerHealth.js,
 * TIDES_MAX_AGE_HOURS = 24h):
 *   - 'ok'    — ih-tides.json fetched within the last 24 h;
 *   - 'stale' — the file exists but fetchedAt is older (the pipeline reuses
 *     the last known file — the outage lives HERE, visible);
 *   - 'down'  — missing file / invalid fetchedAt (first run).
 */

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

/** The pipeline-meta `tideLayer` fields the About card needs (streak window). */
export interface TideLayerMetaLike {
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}

/**
 * Pure derivation — testable without I/O. `meta` is the pipeline-meta
 * `tideLayer` block (streak/lastOkAt) merged into the result for the
 * downtime badge on the About card.
 */
export function deriveTideLayerStatus(
  file: TideFileLike | null | undefined,
  nowMs: number = Date.now(),
  meta: TideLayerMetaLike | null | undefined = null,
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