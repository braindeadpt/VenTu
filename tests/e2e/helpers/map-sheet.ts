import { expect, type Page } from '@playwright/test';

/** Open mobile map spot sheet (retries marker click until dialog is visible). */
export async function openMapSpotSheet(page: Page) {
  await page.waitForSelector('[data-map-hud="visible"]', { timeout: 35_000 });

  const showAll = page.getByRole('button', { name: /Mostrar todos|Show all/i });
  if (await showAll.isVisible()) {
    await showAll.click();
  }

  await page.waitForFunction(() => window.matchMedia('(max-width: 767px)').matches);
  await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

  const sheet = page.getByRole('dialog');
  const markerIcon = page.locator('.leaflet-marker-icon.spot-marker').first();
  await expect(markerIcon).toBeVisible({ timeout: 15_000 });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await markerIcon.click({ position: { x: 14, y: 14 }, force: true });
    try {
      await sheet.waitFor({ state: 'visible', timeout: 4_000 });
      return sheet;
    } catch {
      await page.evaluate(() => {
        const icon = document.querySelector<HTMLElement>('.leaflet-marker-icon.spot-marker');
        icon?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
        );
      });
    }
  }

  await expect(sheet).toBeVisible({ timeout: 10_000 });
  return sheet;
}
