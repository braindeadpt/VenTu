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
  // M7-F: as vistas das zonas são chunks dinâmicos — após goto/reload o
  // sheet pode montar algumas centenas de ms depois de `is-hydrated`.
  // Sem esta espera o helper via um sheet ausente, caía no ramo do HUD
  // antigo (no-op) e os toggles de camadas nunca apareciam. A corrida é
  // contra o botão do HUD (embeds/desktop nunca têm sheet).
  if ((await sheet.count()) === 0) {
    const expandBtn = page.getByRole('button', {
      name: /Mostrar filtros|Show filters/i,
    });
    await Promise.race([
      sheet.waitFor({ state: 'attached', timeout: 10_000 }),
      expandBtn.waitFor({ state: 'visible', timeout: 10_000 }),
    ]).catch(() => {});
  }
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
