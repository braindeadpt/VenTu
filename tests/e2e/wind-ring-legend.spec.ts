import { test, expect } from '@playwright/test';

test.describe('wind ring legend', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('auto-opens once, dismiss persists, help reopens', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu.map.wind', '1');
    });

    await page.goto('/pt/mapa/');
    await page.evaluate(() => localStorage.removeItem('ventu:windRingLegendSeen'));
    await page.reload();

    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
    await page.waitForSelector('[data-map-wind="true"]', { timeout: 15_000 });

    const dialog = page.getByRole('dialog', { name: /Ler o arco de vento/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: 'Percebi', exact: true }).click();
    await expect(dialog).toBeHidden();

    const seen = await page.evaluate(() => localStorage.getItem('ventu:windRingLegendSeen'));
    expect(seen).toBe('1');

    await page.reload();
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
    await page.waitForSelector('[data-map-wind="true"]', { timeout: 15_000 });
    await expect(dialog).toBeHidden({ timeout: 3000 });

    const help = page.getByRole('button', { name: /Como ler o vento no mapa/i });
    await help.scrollIntoViewIfNeeded();
    await help.click({ force: true });
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });
});
