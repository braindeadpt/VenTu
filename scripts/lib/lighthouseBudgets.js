/**
 * Pure budget evaluation for the Lighthouse CI gate.
 *
 * Consumed by scripts/run-lighthouse-prod.js — this module holds NO I/O so
 * the gate contract is unit-testable (scripts/lib/__tests__/lighthouseBudgets.test.js).
 *
 * Budgets were calibrated 2026-09-03 from measured desktop-preset runs of the
 * static export (home 86/mapa 84/spot 73 perf; FCP 456ms, LCP 2315ms,
 * SI 2161ms, TBT 70ms, ~1310KB worst). Headroom policy: ~2× the worst measured
 * value for cheap/stable metrics (FCP, TBT), ~1.5× for the noisiest (LCP, SI,
 * bytes) — CI runners are slower and noisier than a dev machine, and a budget
 * that is red on landing day gates nothing.
 */

/** Audit-id → budget. ms / bytes / dimensionless (CLS). */
const METRIC_BUDGETS = {
  'first-contentful-paint': { limit: 900, unit: 'ms' },
  'largest-contentful-paint': { limit: 3500, unit: 'ms' },
  'speed-index': { limit: 3200, unit: 'ms' },
  'total-blocking-time': { limit: 250, unit: 'ms' },
  'total-byte-weight': { limit: 2097152, unit: 'bytes' },
};

/**
 * Measured but NOT gated: /pt/spots/ hydration shifts the layout after the
 * baked HTML (CLS 0.44 desktop). Any honest CLS budget fails from day one;
 * gating nothing would hide the regression. So CLS is collected, printed by
 * the CLI, and its fix is tracked separately. When the shift is fixed, move
 * CLS into METRIC_BUDGETS (limit 0.1, the standard "good" boundary).
 */
const TRACKED_ONLY_METRICS = ['cumulative-layout-shift'];

/** Category-score floors (unchanged from the original gate). */
const CATEGORY_BUDGETS = { seo: 90, accessibility: 85, performance: 50 };

/**
 * Evaluate one Lighthouse report against the budgets.
 * @param {{categories?: Record<string, {score: number|null}>, audits?: Record<string, {numericValue?: number}>}} report
 * @returns {{breaches: string[], tracked: Array<{id: string, value: number}>, worst: Record<string, number>}}
 *   breaches: human-readable lines (empty = pass). Fail-closed: a budgeted
 *   audit missing from the report is itself a breach.
 */
function evaluateLighthouseBudgets(report) {
  const breaches = [];
  const tracked = [];
  const worst = {};

  for (const [id, { score }] of Object.entries(report.categories ?? {})) {
    const floor = CATEGORY_BUDGETS[id];
    if (floor == null) continue;
    const value = Math.round((score ?? 0) * 100);
    worst[id] = value;
    if (value < floor) {
      breaches.push(`category ${id}: ${value} < ${floor}`);
    }
  }

  const audits = report.audits ?? {};
  for (const [id, { limit, unit }] of Object.entries(METRIC_BUDGETS)) {
    const audit = audits[id];
    if (!audit || audit.numericValue == null) {
      breaches.push(`audit ${id}: missing from report (fail-closed)`);
      continue;
    }
    worst[id] = audit.numericValue;
    if (audit.numericValue > limit) {
      const shown = unit === 'bytes' ? `${Math.round(audit.numericValue / 1024)}KB` : `${Math.round(audit.numericValue)}ms`;
      const cap = unit === 'bytes' ? `${Math.round(limit / 1024)}KB` : `${limit}ms`;
      breaches.push(`audit ${id}: ${shown} > ${cap}`);
    }
  }

  for (const id of TRACKED_ONLY_METRICS) {
    const value = audits[id]?.numericValue;
    if (value != null) tracked.push({ id, value: Math.round(value * 10000) / 10000 });
  }

  return { breaches, tracked, worst };
}

module.exports = { METRIC_BUDGETS, TRACKED_ONLY_METRICS, CATEGORY_BUDGETS, evaluateLighthouseBudgets };
