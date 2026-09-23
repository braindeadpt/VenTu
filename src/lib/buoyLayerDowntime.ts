import { getTranslation } from '@/lib/i18n';

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

/** Suffixo compacto para pills/labels: «· ~5 h» ou «· 3 runs» (só números). */
export function formatBuoyLayerDowntimeSuffix(dt: BuoyLayerDowntime): string {
  if (dt.hours !== null) return `· ~${dt.hours} h`;
  return `· ${dt.runs} runs`;
}

/** Texto completo para tooltips/linhas de diagnóstico (runs + horas). */
export function formatBuoyLayerDowntimeTitle(dt: BuoyLayerDowntime, locale: string): string {
  const t = getTranslation(locale).buoyDowntime;
  const runsLabel =
    dt.runs === 1 ? t.dtRunsOne : t.dtRunsMany.replace('{runs}', String(dt.runs));
  if (dt.hours !== null) {
    return t.dtTitleHours.replace('{hours}', String(dt.hours)).replace('{runs}', runsLabel);
  }
  return t.dtTitleRuns.replace('{runs}', runsLabel);
}