import { expect, type Page } from '@playwright/test';

/**
 * Abre a superfície de filtros do /mapa quando está recolhida.
 *
 * Duas superfícies, mesmo objectivo:
 *  - Sheet mobile (MapExploreSheet): o toggle «Mostrar filtros» leva o sheet
 *    ao estado «half» (filtros + camadas + trilho temporal).
 *  - HUD antigo (embeds): expande as rows do cartão colapsável.
 * No-op em desktop (o painel lateral está sempre aberto) e quando já está
 * aberto — idempotente por contrato.
 */
export async function expandMapHudFilters(page: Page): Promise<void> {
  const sheet = page.locator('[data-explore-sheet]');
  if (await sheet.count()) {
    if ((await sheet.getAttribute('data-explore-sheet')) === 'peek') {
      await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
      await expect(sheet).toHaveAttribute('data-explore-sheet', 'half');
    }
    return;
  }

  const expandBtn = page.getByRole('button', { name: /Mostrar filtros|Show filters/i });
  if (!(await expandBtn.isVisible().catch(() => false))) return;

  const hud = page.locator('[data-map-hud-collapsed]');
  if ((await hud.getAttribute('data-map-hud-collapsed')) !== 'true') return;

  await expandBtn.click();
  await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
}
