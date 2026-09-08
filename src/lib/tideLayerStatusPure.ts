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
  /**
   * Leituras observadas mais recentes (estações com lastObs/lastData,
   * top 5 por recência) — o que a camada devolve quando está viva. Vazio
   * quando o ficheiro é só posições (backend a recuperar) ou não existe.
   */
  observations?: TideObservation[]
  /** Runs consecutivas sem leituras novas (pipeline-meta tideLayer). */
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}

export interface TideObservation {
  title: string
  /** Altura observada em metros (last_sea_surface_height). */
  heightM: number
  /** Timestamp da leitura (last_date_time). */
  at: string
}

export interface TideFileLike {
  fetchedAt?: string
  stations?: Record<string, unknown>
  spotMapping?: Record<string, unknown>
}

/** Estação do ih-tides.json (campos de observação opcionais — podem faltar
 * durante uma recuperação em que o EDR só devolve posições). */
interface TideStationLike {
  title?: unknown
  lastObs?: unknown
  lastData?: unknown
}

/** Top 5 estações com leitura observada, por recência (mais recente 1ª). */
export function latestTideObservations(
  file: TideFileLike | null | undefined,
  limit = 5,
): TideObservation[] {
  if (!file?.stations) return []
  const rows: TideObservation[] = []
  for (const raw of Object.values(file.stations)) {
    const s = (raw ?? {}) as TideStationLike
    const heightM = Number(s.lastObs)
    const at = typeof s.lastData === 'string' ? s.lastData : ''
    const title = typeof s.title === 'string' && s.title.trim() ? s.title.trim() : ''
    if (!Number.isFinite(heightM) || !at || !Number.isFinite(new Date(at).getTime())) continue
    rows.push({ title, heightM, at })
  }
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return rows.slice(0, limit)
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
  const observations = latestTideObservations(file)
  return {
    status,
    ...(fetchedAt ? { fetchedAt } : {}),
    stations: file.stations ? Object.keys(file.stations).length : 0,
    mappedSpots: file.spotMapping ? Object.keys(file.spotMapping).length : 0,
    ...(observations.length > 0 ? { observations } : {}),
    ...(meta?.streak != null ? { streak: meta.streak } : {}),
    ...(meta?.lastStatus ? { lastStatus: meta.lastStatus } : {}),
    ...(meta?.lastOkAt ? { lastOkAt: meta.lastOkAt } : {}),
    ...(meta?.streakUpdatedAt ? { streakUpdatedAt: meta.streakUpdatedAt } : {}),
  }
}