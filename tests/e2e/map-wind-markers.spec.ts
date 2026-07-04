import { test, expect } from '@playwright/test';

test.describe('Map wind compound markers', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.wind', '1');
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.waitForTimeout(2500);
  });

  test('renders compound markers with wind rays', async ({ page }) => {
    await expect(page.locator('[data-map-wind="true"]')).toBeVisible({ timeout: 15_000 });

    const rays = page.locator('.ventu-wind-ray');
    await expect(rays.first()).toBeVisible({ timeout: 20_000 });
    const count = await rays.count();
    expect(count).toBeGreaterThan(50);

    const sample = await page.evaluate(() => {
      const ray = document.querySelector('.ventu-wind-ray line:last-of-type') as SVGLineElement | null;
      const wrap = document.querySelector('.ventu-compound-marker-wrap') as HTMLElement | null;
      const pin = document.querySelector('.ventu-marker-pin circle:nth-of-type(2)') as SVGCircleElement | null;
      if (!ray || !wrap || !pin) return null;
      const lineLen = Math.hypot(
        ray.x2.baseVal.value - ray.x1.baseVal.value,
        ray.y2.baseVal.value - ray.y1.baseVal.value,
      );
      return {
        wrapW: wrap.getBoundingClientRect().width,
        lineLen,
        pinR: pin.r.baseVal.value,
        hasCompound: !!document.querySelector('.ventu-compound-marker'),
        oldArrow: document.querySelectorAll('.ventu-spot-wind').length,
      };
    });

    expect(sample).not.toBeNull();
    expect(sample!.hasCompound).toBe(true);
    expect(sample!.oldArrow).toBe(0);
    expect(sample!.wrapW).toBeGreaterThanOrEqual(52);
    // Ray stem in viewBox should be at least ~14 units (calm wind minimum)
    expect(sample!.lineLen).toBeGreaterThanOrEqual(14);
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
    await expect(page.locator('.ventu-wind-ray').first()).toBeVisible();
    await expect(map).toHaveScreenshot('map-compound-wind-peniche.png', {
      maxDiffPixelRatio: 0.08,
    });
  });
});
