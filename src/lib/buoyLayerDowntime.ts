/**
 * Buoy-layer degradation streak — «há quantas horas a onda observada está
 * degradada». Pure derivation from the pipeline-meta `buoyLayer` block (the
 * same source the workflow health-check reads), shared by every UI surface
 * (FreshnessIndicator, HeroTicker, About) so they never diverge.
 *
 * Producer semantics (scripts/lib/buoyLayerHealth.js):
 *   - `streak` counts runs with status 'down' | 'stale'; resets to 0 on
 *     'ok'/'no-key'. 'no-key' is the configured no-key setup, NOT a
 *     degradation — it never increments.
 *   - `lastOkAt` is kept while degraded (only updated on ok), so
 *     now − lastOkAt is exactly «há quantas horas a camada está degradada».
 */
import type { BuoyLayerMeta } from '@/lib/pipelineMeta';

export interface BuoyLayerDowntime {
  /** Runs consecutivas em down/stale (sempre > 0). */
  runs: number;
  /** Horas desde a última vez ok (null quando nunca esteve ok / sem carimbo). */
  hours: number | null;
  lastOkAt?: string;
}

/**
 * Derive the degradation window from a pipeline-meta buoyLayer block.
 * Returns null unless the layer is ACTUALLY degraded WITH a positive streak —
 * no-key/ok, missing meta, or streak 0 yield null (nothing to show).
 */
export function deriveBuoyLayerDowntime(
  meta: Pick<BuoyLayerMeta, 'status' | 'streak' | 'lastOkAt' | 'streakUpdatedAt'> | null | undefined,
  nowMs: number = Date.now(),
): BuoyLayerDowntime | null {
  if (!meta) return null;
  if (meta.status !== 'down' && meta.status !== 'stale') return null;
  const runs = Number.isFinite(Number(meta.streak)) ? Number(meta.streak) : 0;
  if (runs <= 0) return null;

  let hours: number | null = null;
  let lastOkAt: string | undefined;
  const okTs = meta.lastOkAt ? new Date(meta.lastOkAt).getTime() : NaN;
  if (Number.isFinite(okTs) && okTs > 0) {
    hours = Math.max(0, Math.round((nowMs - okTs) / 3_600_000));
    lastOkAt = meta.lastOkAt;
  }
  return { runs, hours, ...(lastOkAt ? { lastOkAt } : {}) };
}

/** Suffixo compacto para pills/labels: «· ~5 h» ou «· 3 runs». */
export function formatBuoyLayerDowntimeSuffix(dt: BuoyLayerDowntime, isPt: boolean): string {
  if (dt.hours !== null) {
    return dt.hours === 1
      ? isPt
        ? '· ~1 h'
        : '· ~1 h'
      : isPt
        ? `· ~${dt.hours} h`
        : `· ~${dt.hours} h`;
  }
  return isPt ? `· ${dt.runs} runs` : `· ${dt.runs} runs`;
}

/** Texto completo para tooltips/linhas de diagnóstico (runs + horas). */
export function formatBuoyLayerDowntimeTitle(dt: BuoyLayerDowntime, isPt: boolean): string {
  const runsWord = dt.runs === 1 ? 'run' : 'runs';
  // pt: o adjectivo concorda («1 run seguido» vs «4 runs seguidos»).
  const ptParen = isPt
    ? ` (${dt.runs} ${runsWord} seguido${dt.runs === 1 ? '' : 's'})`
    : ` (${dt.runs} consecutive ${runsWord})`;
  if (dt.hours !== null) {
    return isPt
      ? `Camada de boias degradada há ~${dt.hours} h${ptParen}`
      : `Buoy layer degraded for ~${dt.hours} h${ptParen}`;
  }
  return isPt
    ? `Camada de boias degradada há ${dt.runs} ${runsWord} seguido${dt.runs === 1 ? '' : 's'}`
    : `Buoy layer degraded for ${dt.runs} consecutive ${runsWord}`;
}