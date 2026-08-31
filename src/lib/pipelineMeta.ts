import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type BuoyLayerStatus = 'ok' | 'no-key' | 'down' | 'stale';

/** The WMO/Copernicus fallback state the pipeline records into pipeline-meta.json. */
export type WmoBuoyLayerMeta = {
  status: 'ok' | 'down' | 'stale';
  hasWaveData: boolean;
  newestReadingAt?: string;
};

/** The buoy-layer state the pipeline records into pipeline-meta.json. */
export type BuoyLayerMeta = {
  status: BuoyLayerStatus;
  apiKeyConfigured: boolean;
  hasWaveData: boolean;
  newestReadingAt?: string;
  /** Keyless Copernicus fallback state (distinguishes «WMO em baixo»). */
  wmo?: WmoBuoyLayerMeta;
};

/** Real Open-Meteo usage recorded per full run (weighted by requested models). */
export type OpenMeteoUsageMeta = {
  /** Σ (models × HTTP requests) — the metric comparable to the 10k/day budget. */
  weightedCalls: number;
  /** Actual HTTP requests (retries included). */
  requests: number;
  /** Retries (429/transient) that consumed extra quota. */
  retries: number;
  /** Primary spots fully fetched (aliases don't call the API). */
  spotsFetched: number;
  /** 'day' = multimodel, 'night' = best_match only. */
  mode: 'day' | 'night';
  /** Weighted calls per spot for this run type. */
  weightedPerSpot: number;
  waveModels: number;
  windModels: number;
};

export type PipelineMeta = {
  fullUpdatedAt?: string;
  observationsUpdatedAt?: string;
  lastRunAt?: string;
  lastRunMode?: 'full' | 'observations';
  displayUpdatedAt?: string;
  /** IH buoy layer state for diagnostics (no-key/down/stale/ok). */
  buoyLayer?: BuoyLayerMeta | null;
  /** Real Open-Meteo usage this run, for budget monitoring (logs/workflow). */
  openMeteoUsage?: OpenMeteoUsageMeta;
};

export function loadPipelineMeta(): PipelineMeta | null {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'pipeline-meta.json');
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as PipelineMeta;
  } catch {
    return null;
  }
}

/** Hero ticker: most recent pipeline publish (full forecast or obs refresh). */
export function resolveDisplayUpdatedTs(
  pipelineMeta: PipelineMeta | null,
  spotMaxTs: number | null,
): number | null {
  const candidates = [
    pipelineMeta?.displayUpdatedAt,
    pipelineMeta?.observationsUpdatedAt,
    pipelineMeta?.fullUpdatedAt,
  ]
    .map((iso) => (iso ? new Date(iso).getTime() : NaN))
    .filter((ts) => !Number.isNaN(ts));

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }
  return spotMaxTs;
}
