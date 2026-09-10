import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * Colapso do HUD no desktop (decisão 2026-09-10, AUDIT-MAPA-VISUAL-2026-09).
 *
 * O HUD expandido cobria 30–43% do viewport do mapa no desktop (sonda
 * scripts/audit/audit-hud-footprint.mjs) e o desktop não tinha qualquer
 * controlo de colapso — o mobile colapsa desde sempre. Agora o HUD começa
 * colapsado EM TODAS as superfícies; no desktop o toggle é um icon button no
 * canto do cabeçalho (44px, chevron-only, contador no aria-label).
 *
 * Contratos verificados aqui:
 *  1. Desktop arranca colapsado (cards de filtro escondidos).
 *  2. Expandir/colapsar por clique mostra/esconde as rows e troca
 *     aria-expanded + aria-label.
 *  3. Orçamento de cobertura: colapsado (uma linha) cobre < 18% da altura do
 *     mapa; expandido nunca cobre mais de ~36% no desktop 1440x900.
 *  4. A legenda levanta acima do HUD (hudLift) sem colidir.
 */
test.describe('HUD collapse — desktop', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  });

  test('desktop arranca colapsado (rows escondidas) e expande por clique', async ({ page }) => {
    const hud = page.locator('[data-map-hud-collapsed]');
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');

    // Rows de filtro escondidas no estado inicial (Iniciante = row Nível).
    const levelRow = page.getByRole('group', { name: /Nível|Level/i });
    await expect(levelRow).toBeHidden();

    // O toggle de desktop é um icon button no canto do cabeçalho — localizar
    // por aria-label/aria-expanded (o label troca com o estado).
    const toggle = hud.getByRole('button', { name: /Mostrar filtros|Show filters/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
    await expect(levelRow).toBeVisible();
    // O nome do botão troca com o estado («Ocultar filtros») — re-localizar.
    const toggleExpanded = hud.getByRole('button', { name: /Ocultar filtros|Hide filters/i });
    await expect(toggleExpanded).toHaveAttribute('aria-expanded', 'true');

    // Colapsar de volta esconde as rows outra vez.
    await toggleExpanded.click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');
    await expect(levelRow).toBeHidden();
  });

  test('HUD colapsado cobre < 18% da altura do mapa (orçamento)', async ({ page }) => {
    const m = await page.evaluate(() => {
      const hud = document.querySelector('[data-map-hud-collapsed]');
      const card = hud?.firstElementChild?.getBoundingClientRect();
      return { vh: window.innerHeight, top: card?.top ?? 0 };
    });
    const mapH = m.vh - 64; // fullscreen: 100dvh - header 4rem
    const coveredPct = ((m.vh - m.top) / mapH) * 100;
    // Cartão compacto = 1 linha (toggle no cabeçalho): ~13,4% no 1440x900;
    // folga para viewports curtos.
    expect(coveredPct).toBeLessThan(18);
  });

  test('HUD expandido mantém-se dentro do orçamento de 36%', async ({ page }) => {
    const hud = page.locator('[data-map-hud-collapsed]');
    await hud.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
    const m = await page.evaluate(() => {
      const hud = document.querySelector('[data-map-hud-collapsed]');
      const card = hud?.firstElementChild?.getBoundingClientRect();
      return { vh: window.innerHeight, top: card?.top ?? 0 };
    });
    const mapH = m.vh - 64;
    const coveredPct = ((m.vh - m.top) / mapH) * 100;
    // Sonda 2026-09-10: expandido 29,7% no 1440x900.
    expect(coveredPct).toBeLessThan(36);
  });

  test('legenda fica acima do HUD colapsado (sem colisão)', async ({ page }) => {
    // A legenda levanta via hudLift (ResizeObserver sobre o HUD).
    const m = await page.evaluate(() => {
      const legend = document.querySelector('[aria-label="Legenda do mapa"]');
      const hud = document.querySelector('[data-map-hud-collapsed]');
      const lb = legend?.getBoundingClientRect();
      const cb = hud?.firstElementChild?.getBoundingClientRect();
      return { legendBottom: lb?.bottom ?? 0, cardTop: cb?.top ?? 0 };
    });
    expect(m.legendBottom).toBeLessThanOrEqual(m.cardTop + 1);
  });
});
