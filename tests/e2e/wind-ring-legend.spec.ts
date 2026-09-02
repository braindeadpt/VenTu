import { test, expect } from '@playwright/test';
import { WIND_RING_LEGEND_LS_KEY } from '../../src/lib/windRingLegend';

test.describe('wind ring legend', () => {
  // Wind rings are desktop-default-on (readWindPref ignores localStorage on
  // mobile by design), so the coach scenario is exercised at desktop size.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('never auto-opens; inline hint after first marker interaction; help reopens modal', async ({ page }) => {
    // Preseed prefs BEFORE first navigation. The seen flag is removed ONLY in
    // this one init pass; later reloads in this test must keep it, so the
    // flag is re-set to '1' below via the app's own dismiss path instead.
    await page.addInitScript((key) => {
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu.map.wind', '1');
      try { localStorage.removeItem(key); } catch { /* noop */ }
    }, WIND_RING_LEGEND_LS_KEY);

    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.waitForSelector('[data-map-wind="true"]', { timeout: 20_000 });

    // 1) No modal on load, and no hint before any interaction.
    const dialog = page.getByRole('dialog', { name: /Ler o arco de vento/i });
    await expect(dialog).toBeHidden({ timeout: 6_000 });
    const hint = page.getByRole('note', { name: /Como ler o vento no mapa/i });
    await expect(hint).toHaveCount(0);

    // 2) First marker interaction: desktop click opens the popup; the
    //    inline hint must appear (non-modal — the popup stays interactive).
    const marker = page.locator('.leaflet-marker-icon.spot-marker').first();
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click({ force: true });
    await expect(hint).toBeVisible({ timeout: 5_000 });

    // Hint's link opens the full teaching modal on demand (force: the
    // fade-up entrance animation keeps Playwright's stability check busy).
    await hint.getByRole('button', { name: /Como ler o vento no mapa/i }).click({ force: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Percebi', exact: true }).click();
    await expect(dialog).toBeHidden();

    // 3) Persisted: the dismiss above marked it seen — after the hint's
    //    12s auto-hide, further interactions must NOT re-show it.
    const seen = await page.evaluate((key) => localStorage.getItem(key), WIND_RING_LEGEND_LS_KEY);
    expect(seen).toBe('1');
    await expect(hint).toBeHidden({ timeout: 13_000 }); // auto-hide timer
    const marker2 = page.locator('.leaflet-marker-icon.spot-marker').first();
    await expect(marker2).toBeVisible({ timeout: 20_000 });
    await marker2.click({ force: true });
    await page.waitForTimeout(2_000);
    await expect(hint).toBeHidden({ timeout: 3_000 });
  });

  test('help button still opens the full legend modal directly', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu.map.wind', '1');
      localStorage.setItem('ventu:windRingLegendSeen', '1');
    });

    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.waitForSelector('[data-map-wind="true"]', { timeout: 20_000 });

    const dialog = page.getByRole('dialog', { name: /Ler o arco de vento/i });
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    const help = page.getByRole('button', { name: /Como ler o vento no mapa/i });
    await help.scrollIntoViewIfNeeded();
    await help.click({ force: true });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Percebi', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});
