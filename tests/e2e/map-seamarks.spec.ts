import { test, expect } from '@playwright/test';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';

/**
 * OpenSeaMap seamarks overlay — toggle, pane dedicada, legenda e
 * persistência da preferência. Os tiles são interceptados e servidos
 * como pixel PNG (spec hermética — não depende do serviço OpenSeaMap).
 */
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function openMapa(page: import('@playwright/test').Page) {
  await preseedWindRingLegend(page);
  await page.route('**/tiles.openseamap.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_PIXEL });
  });
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map seamarks (OpenSeaMap)', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('toggle liga o overlay, mostra a legenda e persiste a preferência', async ({ page }) => {
    await openMapa(page);

    const map = page.locator('[data-map-seamarks]');
    await expect(map).toHaveAttribute('data-map-seamarks', 'false', { timeout: 15_000 });

    // C4: o toggle vive no menu «Camadas».
    await openMapLayersMenu(page);
    const toggle = page.locator('[data-map-seamarks-toggle]').first();
    await expect(toggle).toBeAttached({ timeout: 20_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // dispatchEvent: a toolbar é overflow-x-auto — o botão pode estar fora da
    // janela visível do pill e o click() normal ficaria à espera do scroll.
    await toggle.dispatchEvent('click');

    await expect(map).toHaveAttribute('data-map-seamarks', 'true', { timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('.leaflet-ventu-seamarks-pane').first(),
    ).toBeAttached({ timeout: 15_000 });
    await expect(
      page.locator('img.leaflet-tile[src*="tiles.openseamap.org"]').first(),
    ).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-map-seamarks-legend]')).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('ventu.map.seamarks')))
      .toBe('1');
  });

  test('desligar remove a camada e grava a preferência a 0', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.seamarks', '1');
    });
    await openMapa(page);

    const map = page.locator('[data-map-seamarks]');
    await expect(map).toHaveAttribute('data-map-seamarks', 'true', { timeout: 15_000 });
    await expect(
      page.locator('img.leaflet-tile[src*="tiles.openseamap.org"]').first(),
    ).toBeAttached({ timeout: 15_000 });

    await openMapLayersMenu(page);
    const toggle = page.locator('[data-map-seamarks-toggle]').first();
    await toggle.dispatchEvent('click');

    await expect(map).toHaveAttribute('data-map-seamarks', 'false', { timeout: 15_000 });
    await expect(
      page.locator('img.leaflet-tile[src*="tiles.openseamap.org"]'),
    ).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('ventu.map.seamarks')))
      .toBe('0');
  });
});
