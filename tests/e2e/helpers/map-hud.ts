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
  // O ramo é decidido pelo viewport, não por sondar o DOM: o sheet é montado
  // pelo cliente ASSÍNCRONO (SpotMapInteractive entra depois de o mapa estar
  // pronto), e um `count()` imediato vê zero em mobile — o helper saía em
  // silêncio, os filtros nunca abriam e o passo seguinte clicava num botão
  // inexistente. No desktop o sheet não existe nunca (é o painel lateral).
  const viewport = page.viewportSize();
  const sheetExpected = viewport !== null && viewport.width < 1024;

  if (sheetExpected) {
    await sheet.first().waitFor({ state: 'attached', timeout: 20_000 });
  }
  if (await sheet.count()) {
    if ((await sheet.getAttribute('data-explore-sheet')) === 'peek') {
      await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
      await expect(sheet).toHaveAttribute('data-explore-sheet', 'half');
    }
    // O atributo muda no mesmo commit que o conteúdo, mas o translateY ainda
    // anima (200–300 ms): um clique imediato falha a acção por instabilidade.
    // Esperar o grupo de modalidade visível E estável é o contrato real que o
    // utilizador tem (a sheet parada, com os filtros utilizáveis).
    await expect(sheet.getByRole('group', { name: /Modalidade|Sport/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(
        async () =>
          sheet.getByRole('group', { name: /Modalidade|Sport/i }).evaluate(
            async (el) => {
              const box = el.getBoundingClientRect();
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
              const next = el.getBoundingClientRect();
              return Math.abs(next.top - box.top) < 0.5;
            },
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
    return;
  }

  const expandBtn = page.getByRole('button', { name: /Mostrar filtros|Show filters/i });
  if (!(await expandBtn.isVisible().catch(() => false))) return;

  const hud = page.locator('[data-map-hud-collapsed]');
  if ((await hud.getAttribute('data-map-hud-collapsed')) !== 'true') return;

  await expandBtn.click();
  await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
}
