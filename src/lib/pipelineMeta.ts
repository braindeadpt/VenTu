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

/** Hero ticker: last Open-Meteo (full) run; fall back to per-spot max. */
export function resolveDisplayUpdatedTs(
  pipelineMeta: PipelineMeta | null,
  spotMaxTs: number | null,
): number | null {
  const fromMeta = pipelineMeta?.displayUpdatedAt ?? pipelineMeta?.fullUpdatedAt;
  if (fromMeta) {
    const ts = new Date(fromMeta).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return spotMaxTs;
}
