import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type PipelineMeta = {
  fullUpdatedAt?: string;
  observationsUpdatedAt?: string;
  lastRunAt?: string;
  lastRunMode?: 'full' | 'observations';
  displayUpdatedAt?: string;
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
