import { test, expect } from '@playwright/test';
import { openMapSpotSheet } from './helpers/map-sheet';

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

  test('difficulty filter persists in localStorage', async ({ page }) => {
    await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
    await page.getByRole('button', { name: 'Iniciante', exact: true }).click();
    const stored = await page.evaluate(() => localStorage.getItem('ventu:map:difficulty'));
    expect(stored).toBe('beginner');
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

    await expect(
      sheet.getByRole('status', { name: /Confiança da previsão/i }),
    ).toBeVisible();
  });

  test('Escape closes sheet', async ({ page }) => {
    await openMapSpotSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });
  });

  test('mobile HUD collapses to show more map', async ({ page }) => {
    const hud = page.locator('[data-map-hud-collapsed]');
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');
    await expect(page.getByRole('button', { name: 'Iniciante', exact: true })).toBeHidden();

    await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
    await expect(page.getByRole('button', { name: 'Iniciante', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Ocultar filtros|Hide filters/i }).click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');
    await expect(page.getByRole('button', { name: 'Iniciante', exact: true })).toBeHidden();
  });

  test('exit and re-enter map without freezing', async ({ page }) => {
    test.setTimeout(90_000);

    await page.getByRole('button', { name: /Sair do ecrã inteiro|Exit full screen/i }).click();
    await page.waitForURL(/\/pt\/?$/, { timeout: 15_000 });

    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('');

    const mainOpacity = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      return main ? getComputedStyle(main).opacity : '1';
    });
    expect(Number(mainOpacity)).toBeGreaterThan(0.9);

    await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
    await expect(page.locator('[data-map-fullscreen="true"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Sair do ecrã inteiro|Exit full screen/i }).click();
    await page.waitForURL(/\/pt\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('banner')).toBeVisible();
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
