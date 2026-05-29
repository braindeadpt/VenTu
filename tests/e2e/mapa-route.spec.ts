import { test, expect } from '@playwright/test';

test.describe('/pt/mapa fullscreen map', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
  });

  test('opens in fullscreen with HUD visible', async ({ page }) => {
    const mapShell = page.locator('[data-map-fullscreen="true"]');
    await expect(mapShell).toBeVisible({ timeout: 20_000 });
    await expect(mapShell).toHaveAttribute('data-map-hud', 'visible');
    await expect(page.getByRole('heading', { name: /Mapa de spots/i, level: 1 })).toBeAttached();
  });

  test('marker opens sheet with directions and view spot', async ({ page }) => {
    const showAll = page.getByRole('button', { name: /Mostrar todos|Show all/i });
    if (await showAll.isVisible()) {
      await showAll.click();
    }
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 25_000 });
    const marker = page.locator('.leaflet-marker-icon.spot-marker').first();
    await marker.click({ position: { x: 14, y: 14 }, force: true });

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const directions = sheet.getByRole('link', { name: /Como chegar/i });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir/);

    await expect(sheet.getByRole('link', { name: /Ver spot/i })).toBeVisible();
  });
});

test.describe('/pt/mapa SEO', () => {
  test('canonical link uses trailing slash', async ({ page }) => {
    await page.goto('/pt/mapa/');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/pt\/mapa\/$/);
  });

  test('EN map page title', async ({ page }) => {
    await page.goto('/en/mapa/');
    await expect(page).toHaveTitle(/Spots map — VenTu/i);
  });
});
