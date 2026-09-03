import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * Basemap resilience — hermetic against the local `out/` build:
 * when every tile provider is unreachable the map must surface a visible
 * failure state (not a silent grey canvas), and the retry button must
 * re-attach the basemap and reach `data-map-tiles="ok"` once providers
 * answer again.
 */
test.describe('map basemap resilience', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('tiles blocked → failed state + retry re-attaches the basemap', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.route(/basemaps\.cartocdn\.com|server\.arcgisonline\.com/, (route) => route.abort());

    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    const map = page.locator('.leaflet-container');

    // Carto blocked → swap to Esri → Esri blocked too → definitive failure.
    await expect(map).toHaveAttribute('data-map-tiles', 'failed', { timeout: 25_000 });

    const retry = page.getByRole('button', { name: /Atualizar|Refresh/i });
    await expect(retry).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /mapa|map/i })).toBeVisible();

    // Unblock the providers and retry: the map must paint again.
    await page.unroute(/basemaps\.cartocdn\.com|server\.arcgisonline\.com/);
    await retry.click();
    await expect(map).toHaveAttribute('data-map-tiles', 'ok', { timeout: 25_000 });
    await expect(retry).toBeHidden();
    await expect(page.locator('.leaflet-tile').first()).toBeVisible({ timeout: 15_000 });
  });
});