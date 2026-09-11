import { test, expect } from '@playwright/test';
import { discoverAllRoutes, sampleRoutes, SAMPLE_SIZES } from './helpers/discover-routes';
import { attachPageHealthCollectors, assertHealthyPage } from './helpers/audit-utils';
import { preseedWindRingLegend } from './helpers/map-setup';

const allRoutes = discoverAllRoutes();
const routes = sampleRoutes(allRoutes);

test.describe.configure({ mode: 'parallel' });

test.describe('Full route audit (browser: uncaught JS)', () => {
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
  });
  for (const { path, group } of routes) {
    test(`${group}: ${path}`, async ({ page }) => {
      const health = attachPageHealthCollectors(page);
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);

      const isAlertPage = path.includes('/alerts/confirm') || path.includes('/alerts/unsubscribe');
      await assertHealthyPage(page, health, {
        allowLoadingState: isAlertPage,
        strictNetwork: false,
        strictConsole: false,
      });
    });
  }
});

test('route inventory matches build scale', () => {
  expect(allRoutes.length).toBeGreaterThan(500);
  const groups = new Set(allRoutes.map((r) => r.group));
  expect(groups).toEqual(new Set(['static', 'modalidade', 'explorar', 'spot', 'news']));
});

/**
 * The per-push run is a deterministic stratified sample: distinct templates
 * (static, modalidade) are never sampled; same-template groups (spot, news,
 * explorar) shrink to a fixed stride over the sorted list. Guards the split
 * so a helper edit can't silently turn this into a random-per-run sample or
 * silently re-expand to the full 1585-route browser run (~14 min on CI).
 */
test('sample is deterministic and never thins distinct templates', () => {
  // Force sampled mode: the daily audit sets VENTU_FULL_AUDIT=1, which makes
  // sampleRoutes() return everything — this guard tests the sampler itself,
  // not the ambient env.
  const sampled = sampleRoutes(allRoutes, { full: false });
  const byGroup = (list) => {
    const m = new Map();
    for (const r of list) {
      if (!m.has(r.group)) m.set(r.group, []);
      m.get(r.group).push(r);
    }
    return m;
  };
  const sampledGroups = byGroup(sampled);
  const allGroups = byGroup(allRoutes);

  // Distinct templates: every route, every run.
  for (const g of ['static', 'modalidade']) {
    expect(sampledGroups.get(g).length).toBe(allGroups.get(g).length);
  }
  // Same-template groups: capped, deterministic.
  for (const g of ['spot', 'news', 'explorar']) {
    const expectedSize = SAMPLE_SIZES[g];
    expect(sampledGroups.get(g).length).toBe(Math.min(expectedSize, allGroups.get(g).length));
    const strideSample = sampledGroups.get(g).map((r) => r.path);
    expect(new Set(strideSample).size).toBe(strideSample.length, `no duplicates in ${g}`);
  }
  // Determinism: same input → identical output.
  expect(sampleRoutes(allRoutes, { full: false })).toEqual(sampled);
  // Full mode restores every route.
  expect(sampleRoutes(allRoutes, { full: true })).toEqual(allRoutes);
});
