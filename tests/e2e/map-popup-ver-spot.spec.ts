import { test, expect } from '@playwright/test';

test.describe('Map popup Ver spot', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
  });

  test('Ver spot link navigates to spot detail', async ({ page }) => {
    await page.locator('.leaflet-marker-icon.spot-marker').first().click({ force: true });
    const link = page.locator('.ventu-popup-detail').first();
    await expect(link).toBeVisible({ timeout: 10_000 });

    const href = await link.getAttribute('href');
    expect(href).toMatch(/\/pt\/spots\/[^/]+\//);

    await link.click();
    await expect(page).toHaveURL(/\/pt\/spots\/[^/]+\//, { timeout: 15_000 });
  });
});
