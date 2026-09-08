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
 *
 * CLS is gated since 2026-09-04: the spot page baked its data into the static
 * HTML (skeleton → content swap was CLS 0.44), and 0.1 is the standard "good"
 * boundary. Keep it gated — a regression back to client-only loading must fail.
 */

/** Audit-id → budget. ms / bytes / dimensionless ratio (CLS). */
const METRIC_BUDGETS = {
  'first-contentful-paint': { limit: 900, unit: 'ms' },
  'largest-contentful-paint': { limit: 3500, unit: 'ms' },
  'speed-index': { limit: 3200, unit: 'ms' },
  'total-blocking-time': { limit: 250, unit: 'ms' },
  'total-byte-weight': { limit: 2097152, unit: 'bytes' },
  'cumulative-layout-shift': { limit: 0.1, unit: 'ratio' },
};

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
      const shown =
        unit === 'bytes'
          ? `${Math.round(audit.numericValue / 1024)}KB`
          : unit === 'ratio'
            ? `${Math.round(audit.numericValue * 1000) / 1000}`
            : `${Math.round(audit.numericValue)}ms`;
      const cap =
        unit === 'bytes' ? `${Math.round(limit / 1024)}KB` : unit === 'ratio' ? `${limit}` : `${limit}ms`;
      breaches.push(`audit ${id}: ${shown} > ${cap}`);
    }
  }

  return { breaches, worst };
}

/**
 * Median across repeated Lighthouse runs of the SAME page — the noise-robust
 * gate for lab metrics. Google's guidance is to run several times and gate on
 * the median: one contention spike (a noisy shared CI runner) must not fail
 * the build, while a genuine regression breaches in the majority of runs and
 * therefore still breaches the median. Pure — no I/O, unit-tested beside
 * evaluateLighthouseBudgets.
 *
 * @param {Array<{categories?: Record<string, {score: number|null}>, audits?: Record<string, {numericValue?: number}>}>} reports
 * @returns {{categories: Record<string, {score: number}>, audits: Record<string, {numericValue: number}>}}
 */
function medianReport(reports) {
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const catValues = {};
  const auditValues = {};
  for (const r of reports) {
    for (const [id, cat] of Object.entries(r.categories ?? {})) {
      if (typeof cat?.score === 'number') {
        (catValues[id] ??= []).push(cat.score);
      }
    }
    for (const [id, audit] of Object.entries(r.audits ?? {})) {
      if (typeof audit?.numericValue === 'number') {
        (auditValues[id] ??= []).push(audit.numericValue);
      }
    }
  }

  const out = { categories: {}, audits: {} };
  for (const [id, xs] of Object.entries(catValues)) {
    if (xs.length > 0) out.categories[id] = { score: median(xs) };
  }
  for (const [id, xs] of Object.entries(auditValues)) {
    if (xs.length > 0) out.audits[id] = { numericValue: median(xs) };
  }
  return out;
}

module.exports = { METRIC_BUDGETS, CATEGORY_BUDGETS, evaluateLighthouseBudgets, medianReport };
