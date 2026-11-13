import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * #455 P0 — o `Drawer` voltou a montar. O efeito de `isOpen` tinha perdido o
 * `setMounted(true)` e o rAF do `visible`: o `SpotDrawer` do grid (/spots,
 * /modalidades, /explorar) ficava invisível e o `lockBodyScroll()` congelava
 * a página. O contrato aqui é o do report: abrir mostra a gaveta E tranca o
 * scroll; Escape fecha e devolve o scroll.
 *
 * No grid o caminho do utilizador é marcador → CTA «Ver spot» do popup
 * (`onSpotSelect` do `SpotGridClient` → `SpotDrawer`).
 */
test.describe('Drawer do grid de spots (#455)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

  test('/pt/spots/: abrir a gaveta tranca o scroll e Escape devolve-o', async ({ page }) => {
    test.setTimeout(90_000);
    await preseedWindRingLegend(page);
    // Cluster é o default no desktop — marcadores individuais só com o
    // agrupamento desligado (mesma receita do map-score-factors).
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });

    await page.goto('/pt/spots/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitHydrated(page);
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

    await page.locator('.leaflet-marker-icon.spot-marker').first().click({ force: true });
    await page.locator('.spot-popup .ventu-popup-detail').click();

    const drawer = page.locator('[role="dialog"]');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // `toBeVisible` não distingue a gaveta montada fora do ecrã
    // (translateX(-100%)) — a posição é que prova que ela entrou.
    await expect
      .poll(async () => (await drawer.boundingBox())?.x ?? -1, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(0);
    await expect(page.locator('[data-drawer-close]')).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');

    await expect(drawer).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});
