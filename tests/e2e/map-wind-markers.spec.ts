import { test, expect } from '@playwright/test';

test.describe('Map wind ring markers', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.wind', '1');
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu:windRingLegendSeen', '1');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.waitForTimeout(2500);
  });

  test('renders integrated wind rings on individual markers', async ({ page }) => {
    await expect(page.locator('[data-map-wind="true"]')).toBeVisible({ timeout: 15_000 });

    const rings = page.locator('.ventu-wind-ring');
    await expect(rings.first()).toBeVisible({ timeout: 20_000 });
    const count = await rings.count();
    expect(count).toBeGreaterThan(50);

    const sample = await page.evaluate(() => {
      const ring = document.querySelector('.ventu-wind-ring-arc') as SVGPathElement | null;
      const wrap = document.querySelector('.ventu-wind-ring-marker-wrap') as HTMLElement | null;
      const pin = document.querySelector('.ventu-marker-pin circle:nth-of-type(2)') as SVGCircleElement | null;
      if (!ring || !wrap || !pin) return null;
      const wrapBox = wrap.getBoundingClientRect();
      return {
        wrapW: wrapBox.width,
        wrapH: wrapBox.height,
        pinR: pin.r.baseVal.value,
        hasRing: !!document.querySelector('.ventu-wind-ring'),
        legacyWedge: document.querySelectorAll('.ventu-wind-wedge').length,
        legacyArrow: document.querySelectorAll('.ventu-wind-arrow, .ventu-spot-wind').length,
      };
    });

    expect(sample).not.toBeNull();
    expect(sample!.hasRing).toBe(true);
    expect(sample!.legacyWedge).toBe(0);
    expect(sample!.legacyArrow).toBe(0);
    expect(sample!.wrapW).toBeLessThanOrEqual(60);
    expect(sample!.wrapH).toBeLessThanOrEqual(50);
    expect(sample!.pinR).toBeCloseTo(17, 0);
  });

  test('visual snapshot at Peniche zoom', async ({ page }) => {
    await page.evaluate(() => {
      const map = window.L?.map?.get?.();
      if (map) map.setView([39.36, -9.38], 11);
    });
    await page.waitForTimeout(2000);
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
    await expect(page.locator('.ventu-wind-ring').first()).toBeVisible();
    await expect(map).toHaveScreenshot('map-wind-ring-peniche.png', {
      maxDiffPixelRatio: 0.08,
    });
  });
});
