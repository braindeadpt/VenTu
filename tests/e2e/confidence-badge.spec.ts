import { test, expect } from '@playwright/test';

test.describe('Forecast confidence badge', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('map sheet shows accessible confidence status', async ({ page }) => {
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });

    const showAll = page.getByRole('button', { name: /Mostrar todos|Show all/i });
    if (await showAll.isVisible()) {
      await showAll.click();
    }
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 25_000 });
    await page.locator('.leaflet-marker-icon.spot-marker').first().click({
      position: { x: 14, y: 14 },
      force: true,
    });

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
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
