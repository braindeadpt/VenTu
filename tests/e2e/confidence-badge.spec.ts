import { test, expect } from '@playwright/test';
import { openMapSpotSheet } from './helpers/map-sheet';
import { preseedWindRingLegend } from './helpers/map-setup';

test.describe('Forecast confidence badge', () => {
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
  });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('map sheet shows accessible confidence status', async ({ page }) => {
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
    const sheet = await openMapSpotSheet(page);
    await expect(
      sheet.getByRole('status', { name: /Confiança da previsão/i }),
    ).toBeVisible();
  });

  test('spot Agora block shows confidence status', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('status', { name: /Confiança da previsão/i }).first(),
    ).toBeVisible();
  });
});
