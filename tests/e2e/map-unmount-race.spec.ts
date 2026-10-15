/**
 * Unmount-race regression spec (CI run 34075896616).
 *
 * The visual-ux-audit mobile header tests used to fail with "Cannot read
 * properties of undefined (reading 'save')" whenever the homepage — whose
 * hero embeds a Leaflet map with canvas-rendered vector layers — was unmounted
 * by an SPA navigation (search flow, language switch). Root cause: during
 * teardown Leaflet 1.9.4 can destroy the shared canvas renderer before the
 * vector overlays are detached, and each overlay removed afterwards schedules
 * a redraw frame against the dead canvas (_ctx deleted), which throws on the
 * next animation frame (leaflet#8373 class). Fixed by the teardown
 * overlay-sweep, the prototype-level canvas guard (commit 8326a7bd0), the
 * nested zoom-rAF cancellation in the currents field and the unload-guarded
 * isobaths restyle.
 *
 * These tests lock the fix in end to end on the surface that actually
 * crashed: the homepage hero map on a 390px mobile viewport, unmounted via
 * real SPA navigation. Variant A mirrors the language-switch failure (05);
 * variant B double-click-zooms the hero and then navigates via the search
 * palette (03) — the "zoom then navigate immediately" shape. Both assert zero
 * uncaught page errors after the navigation.
 *
 * Verified trip behaviour: with the sweep + canvas guard removed from the
 * build, both tests fail with the original "Cannot read properties of
 * undefined (reading 'save')" page error; with the fix they pass.
 *
 * #183: the homepage no longer embeds the Leaflet hero (home v6 has the
 * MapLibre 3D coast map). The Leaflet A/B variants now run on /pt/mapa/ —
 * the same SpotMapInteractive with the same canvas vector layers, unmounted
 * by the same SPA navigations — and the home gets the same two shapes for its
 * new map (C/D), so both map stacks stay locked.
 */
import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { attachPageHealthCollectors, assertHealthyPage } from './helpers/audit-utils';
import { waitHydrated } from './helpers/hydration';

test.describe('Map unmount race (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  test.describe.configure({ timeout: 90_000 });

  /** Load /pt/mapa/ (Leaflet map mounts) and collect page/console health. */
  async function gotoMapaHealthy(page: import('@playwright/test').Page) {
    await preseedWindRingLegend(page);
    const health = attachPageHealthCollectors(page);
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Drawer/search taps later in these tests need the shell hydrated
    // (pre-hydration taps are silently swallowed — CI-only flake).
    await waitHydrated(page);
    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/Mapa dos spots/i).first()).toBeVisible({ timeout: 20_000 });
    // Let the map finish initialising so the vector layers are mounted
    // before the unmount (the CI failures happened mid-interaction, not at
    // first paint).
    await page.waitForTimeout(1500);
    await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
    return { health, map };
  }

  /** Load the homepage (home v6 coast map mounts: 3D or flat) and collect health. */
  async function gotoHomeHealthy(page: import('@playwright/test').Page) {
    const health = attachPageHealthCollectors(page);
    await page.goto('/pt/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitHydrated(page);
    const fig = page.getByRole('region', { name: /Mapa interactivo/i }).locator('figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-pronto', '1', { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
    return { health, map: fig };
  }

  /** Switch language PT → EN from the mobile drawer (SPA, unmounts the hero). */
  async function switchLocaleToEn(page: import('@playwright/test').Page) {
    const trigger = page.locator('button[aria-controls="mobile-nav"]');
    await trigger.click();
    await page.locator('#mobile-nav select').selectOption('en');
    // o /mapa mantém o estado na query (?sport=…&wind=…) ao trocar de língua
    await expect(page).toHaveURL(/\/en\/(mapa\/)?(\?[^#]*)?$/, { timeout: 10_000 });
  }

  /** Search "Guincho" from the header palette and open the spot (SPA). */
  async function searchAndOpenGuincho(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /Pesquisar|Search/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Guincho');
    await dialog.getByRole('link', { name: /Guincho/i }).first().click();
    await expect(page).toHaveURL(/\/pt\/spots\/guincho\/?/, { timeout: 10_000 });
  }

  for (const [nome, abrir] of [
    ['/pt/mapa/ (Leaflet)', gotoMapaHealthy],
    ['home v6 (MapLibre)', gotoHomeHealthy],
  ] as const) {
    test(`A — unmount the map via language switch (SPA) → zero uncaught errors · ${nome}`, async ({ page }) => {
      const { health } = await abrir(page);

      await switchLocaleToEn(page);

      // Let any straggler post-unmount frame fire before judging.
      await page.waitForTimeout(500);
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
    });

    test(`B — zoom the map, then navigate away immediately → zero uncaught errors · ${nome}`, async ({ page }) => {
      const { health, map } = await abrir(page);

      // Animated double-click zoom on the map, then navigate away in the
      // same burst so the unmount lands close to the zoom repaint window.
      const box = await map.boundingBox();
      if (!box) throw new Error('map container has no box');
      // No mapa da home o centro tem rótulos de spots (um clique abre o spot); o duplo clique cai no
      // mar, a oeste da costa, onde não há rótulos — o zoom é o mesmo nos dois mapas.
      const fx = nome.startsWith('home') ? 0.12 : 0.5;
      await page.mouse.dblclick(box.x + box.width * fx, box.y + box.height / 2);
      await page.waitForTimeout(80);

      await searchAndOpenGuincho(page);

      await page.waitForTimeout(500);
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
    });
  }
});
