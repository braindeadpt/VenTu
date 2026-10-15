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

  // A página de spot v6 (#184) já não mostra o selo de confiança («Como sabemos»
  // saiu com os duplicados do antigo contexto): fica coberto no sheet do mapa.
});
