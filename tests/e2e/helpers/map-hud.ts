import { expect, type Page } from '@playwright/test';

/** Expand mobile map HUD filters when collapsed (default on /mapa/). No-op on desktop. */
export async function expandMapHudFilters(page: Page): Promise<void> {
  const expandBtn = page.getByRole('button', { name: /Mostrar filtros|Show filters/i });
  if (!(await expandBtn.isVisible().catch(() => false))) return;

  const hud = page.locator('[data-map-hud-collapsed]');
  if ((await hud.getAttribute('data-map-hud-collapsed')) !== 'true') return;

  await expandBtn.click();
  await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
}
