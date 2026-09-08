import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateLighthouseBudgets, METRIC_BUDGETS, medianReport } = require('../lighthouseBudgets');

/** Build a report-shaped object with the given category scores (0-1) and audit ms values. */
function report(scores = {}, audits = {}) {
  return {
    categories: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v }])),
    audits: Object.fromEntries(
      Object.entries(audits).map(([k, v]) => [k, { numericValue: v }]),
    ),
  };
}

const PASSING = report(
  { seo: 0.97, accessibility: 0.96, performance: 0.73 },
  {
    'first-contentful-paint': { numericValue: 456 },
    'largest-contentful-paint': { numericValue: 2315 },
    'speed-index': { numericValue: 2161 },
    'total-blocking-time': { numericValue: 70 },
    'total-byte-weight': { numericValue: 1310000 },
    'cumulative-layout-shift': { numericValue: 0.02 },
  },
);

describe('evaluateLighthouseBudgets', () => {
  it('passes a healthy report with zero breaches', () => {
    const { breaches } = evaluateLighthouseBudgets(PASSING);
    expect(breaches).toEqual([]);
  });

  it('flags a category below its floor', () => {
    const r = structuredClone(PASSING);
    r.categories.seo = { score: 0.89 };
    const { breaches } = evaluateLighthouseBudgets(r);
    expect(breaches).toEqual(['category seo: 89 < 90']);
  });

  it.each([
    ['first-contentful-paint', 950, 'audit first-contentful-paint: 950ms > 900ms'],
    ['largest-contentful-paint', 3600, 'audit largest-contentful-paint: 3600ms > 3500ms'],
    ['speed-index', 3400, 'audit speed-index: 3400ms > 3200ms'],
    ['total-blocking-time', 300, 'audit total-blocking-time: 300ms > 250ms'],
  ])('flags %s over budget', (id, value, expected) => {
    // Plain numbers — report() wraps each into { numericValue }.
    const audits = Object.fromEntries(
      Object.entries(METRIC_BUDGETS).map(([k, b]) => [k, k === id ? value : b.limit - 1]),
    );
    const { breaches } = evaluateLighthouseBudgets(report({}, audits));
    expect(breaches).toContain(expected);
  });

  it('formats byte breaches in KB', () => {
    const audits = Object.fromEntries(
      Object.entries(METRIC_BUDGETS).map(([k, b]) => [
        k,
        k === 'total-byte-weight' ? 3 * 1024 * 1024 : b.limit - 1,
      ]),
    );
    const { breaches } = evaluateLighthouseBudgets(report({}, audits));
    expect(breaches).toContain('audit total-byte-weight: 3072KB > 2048KB');
  });

  it('allows values exactly at the limit (budgets are inclusive)', () => {
    const audits = Object.fromEntries(
      Object.entries(METRIC_BUDGETS).map(([k, b]) => [k, { numericValue: b.limit }]),
    );
    const { breaches } = evaluateLighthouseBudgets(
      report({ seo: 0.9, accessibility: 0.85, performance: 0.5 }, audits),
    );
    expect(breaches).toEqual([]);
  });

  it('fails closed when a budgeted audit is missing from the report', () => {
    const { breaches } = evaluateLighthouseBudgets({
      categories: { seo: { score: 1 } },
      audits: {},
    });
    expect(breaches).toHaveLength(Object.keys(METRIC_BUDGETS).length);
    expect(breaches[0]).toContain('fail-closed');
  });

  it('flags cumulative-layout-shift over the 0.1 gate', () => {
    const r = structuredClone(PASSING);
    r.audits['cumulative-layout-shift'] = { numericValue: 0.4396 };
    const { breaches } = evaluateLighthouseBudgets(r);
    expect(breaches).toEqual(['audit cumulative-layout-shift: 0.44 > 0.1']);
  });

  it('passes cumulative-layout-shift at exactly the 0.1 gate (inclusive)', () => {
    const r = structuredClone(PASSING);
    r.audits['cumulative-layout-shift'] = { numericValue: 0.1 };
    const { breaches } = evaluateLighthouseBudgets(r);
    expect(breaches).toEqual([]);
  });

  it('ignores categories and audits that have no budget', () => {
    const r = structuredClone(PASSING);
    r.categories['best-practices'] = { score: 0.3 };
    r.audits['some-random-audit'] = { numericValue: 999999 };
    const { breaches } = evaluateLighthouseBudgets(r);
    expect(breaches).toEqual([]);
  });
});

describe('medianReport', () => {
  const tbt = (v) => ({ audits: { 'total-blocking-time': { numericValue: v } } });

  // A full report with the TBT overridden — the other five budgeted audits
  // stay under their limits so fail-closed doesn't fire. Built through report()
  // with plain numbers (the legacy PASSING fixture double-wraps values, which
  // the old evaluator tolerated but medianReport's typeof check does not).
  const withTbt = (tbtMs) =>
    report(
      { seo: 0.97, accessibility: 0.96, performance: 0.73 },
      {
        'first-contentful-paint': 456,
        'largest-contentful-paint': 2315,
        'speed-index': 2161,
        'total-blocking-time': tbtMs,
        'total-byte-weight': 1310000,
        'cumulative-layout-shift': 0.02,
      },
    );

  it('passes when only one of three runs spikes over budget', () => {
    // One 1181ms spike among two healthy runs: the median stays under the 250ms gate.
    const med = medianReport([withTbt(1181), withTbt(70), withTbt(90)]);
    expect(med.audits['total-blocking-time'].numericValue).toBe(90);
    const { breaches } = evaluateLighthouseBudgets(
      medianReport([withTbt(1181), withTbt(70), withTbt(90)]),
    );
    expect(breaches).toEqual([]);
  });

  it('fails when the majority of runs breach (median over budget)', () => {
    const med = medianReport([withTbt(1181), withTbt(506), withTbt(70)]);
    expect(med.audits['total-blocking-time'].numericValue).toBe(506);
    const { breaches } = evaluateLighthouseBudgets(med);
    expect(breaches).toEqual(['audit total-blocking-time: 506ms > 250ms']);
  });

  it('mediates category scores as well as audit values', () => {
    const med = medianReport([
      report({ performance: 0.5, seo: 0.9 }),
      report({ performance: 0.9, seo: 0.95 }),
      report({ performance: 0.55, seo: 0.92 }),
    ]);
    expect(med.categories.performance.score).toBe(0.55);
    expect(med.categories.seo.score).toBe(0.92);
  });

  it('handles an even run count by averaging the two middles', () => {
    const med = medianReport([tbt(100), tbt(200)]);
    expect(med.audits['total-blocking-time'].numericValue).toBe(150);
  });

  it('keeps audits missing from some runs when present in others', () => {
    const med = medianReport([tbt(100), { audits: {} }]);
    expect(med.audits['total-blocking-time'].numericValue).toBe(100);
  });

  it('returns empty categories/audits for an empty input', () => {
    const med = medianReport([]);
    expect(med).toEqual({ categories: {}, audits: {} });
  });
});
