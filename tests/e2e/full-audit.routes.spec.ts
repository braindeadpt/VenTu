import { test, expect } from '@playwright/test';
import { discoverAllRoutes } from './helpers/discover-routes';
import { attachPageHealthCollectors, assertHealthyPage } from './helpers/audit-utils';
import { preseedWindRingLegend } from './helpers/map-setup';

const allRoutes = discoverAllRoutes();

test.describe.configure({ mode: 'parallel' });

test.describe('Full route audit', () => {
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
  });
  for (const { path, group } of allRoutes) {
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
