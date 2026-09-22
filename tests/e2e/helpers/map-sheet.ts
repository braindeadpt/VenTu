import { expect, type Page } from '@playwright/test';

/**
 * Desfaz o cluster pelo toggle real do sheet. O mobile força cluster no
 * arranque (ignora o LS), por isso o único caminho é a UI: peek → half →
 * «Mostrar todos», voltando ao peek no fim.
 */
export async function showAllMapMarkers(page: Page) {
  const showAll = page.getByRole('button', { name: /Mostrar todos|Show all/i }).first();
  if (!(await showAll.isVisible().catch(() => false))) {
    await page.locator('[data-sheet-grabber]').click();
    await expect(page.locator('[data-explore-sheet]')).toHaveAttribute('data-explore-sheet', 'half');
  }
  if (await showAll.isVisible().catch(() => false)) {
    await showAll.click();
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
    const sheet = page.locator('[data-explore-sheet]');
    const grabber = page.locator('[data-sheet-grabber]');
    for (let i = 0; i < 3; i += 1) {
      if ((await sheet.getAttribute('data-explore-sheet')) === 'peek') break;
      await grabber.click();
    }
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek');
  }
}

/** Open mobile map spot sheet (retries marker click until dialog is visible). */
export async function openMapSpotSheet(page: Page) {
  await page.waitForSelector('[data-map-hud="visible"]', { timeout: 35_000 });
  await showAllMapMarkers(page);

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
