import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

test.describe('Map popup Ver spot', () => {
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
  });

  test('Ver spot link navigates to spot detail', async ({ page }) => {
    // Root cause of the historical 'Element is outside of the viewport' flake:
    // the first marker in DOM order is whichever spot finished chunked insertion
    // first — not necessarily inside the initial national view. A marker outside
    // the current Leaflet view renders at a viewport-external pixel position,
    // and click({ force: true }) does NOT scroll Leaflet (it pans the page, not
    // the map). Fix: pick a marker that is actually INSIDE the visible viewport
    // (evaluated in-page, not via locator filter), then click it. No map pan,
    // no retries, deterministic.
    // Poll in-page until a marker is fully inside the viewport, then grab its
    // identifying attributes and click it through a normal locator (so all
    // Playwright actionability still applies).
    const pick = await page.waitForFunction(
      () => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const markers = Array.from(
          document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
        );
        for (const m of markers) {
          const r = m.getBoundingClientRect();
          if (
            r.width > 0 &&
            r.height > 0 &&
            r.left >= 0 &&
            r.top >= 0 &&
            r.right <= vw &&
            r.bottom <= vh
          ) {
            return { index: markers.indexOf(m) };
          }
        }
        return null;
      },
      { timeout: 30_000, polling: 250 },
    );
    const markerIndex = (await pick.jsonValue()) as { index: number };
    const marker = page.locator('.leaflet-marker-icon.spot-marker').nth(markerIndex.index);
    await marker.click({ force: true });
    const link = page.locator('.ventu-popup-detail').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    const href = await link.getAttribute('href');
    expect(href).toMatch(/\/pt\/spots\/[^/]+\//);

    await link.click();
    await expect(page).toHaveURL(/\/pt\/spots\/[^/]+\//, { timeout: 15_000 });
  });
});
