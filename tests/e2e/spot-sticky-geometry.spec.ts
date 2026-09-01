import { test, expect, type Page } from '@playwright/test';

/**
 * SpotStickyBar — não-sobreposição com os sport tabs (geometria).
 *
 * A barra fixa (SpotStickyBar, `top: var(--ventu-spot-sticky-top)` = 64px,
 * z-30) substitui a linha standalone de sport tabs quando o hero sai do
 * viewport: a secção sticky (`sticky`, mesmo token, z-20) passa a
 * `visibility: hidden` — NUNCA pode ficar visível por baixo/por cima da barra,
 * e um clique na posição dos tabs tem de cair nos tabs DA BARRA (hit-test),
 * não numa linha escondida nem em nada que a cubra. Tanto em desktop como em
 * mobile (390px) — onde a fila rola horizontalmente e o risco de cobrir a
 * linha é maior.
 *
 * Os tokens (cota 64px, altura da fila 48px) vêm do globals.css; a guarda
 * unitária (spacingTokens.test.ts) impede que voltem a hard-codar.
 */
test.describe('SpotStickyBar — não cobre os sport tabs (desktop + mobile)', () => {
  test.use({ serviceWorkers: 'block' });

  /** Navega para o guincho, rola até a barra ficar activa e devolve a geometria. */
  async function scrollUntilSticky(page: Page) {
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect(
      page.getByRole('region', { name: 'Métricas principais' }),
    ).toBeVisible({ timeout: 20_000 });
    // Espera o estado estabilizar (scroll + observer do hero).
    await page.waitForFunction(
      () =>
        document.querySelector('[role="region"][aria-label="Métricas principais"]') !== null,
    );
  }

  /** Sonda de geometria: as duas tablists, visibilidade e hit-tests de clique. */
  async function probe(page: Page) {
    return page.evaluate(() => {
      const tablists = Array.from(document.querySelectorAll('[role="tablist"]'));
      const bar = tablists.find((el) => el.closest('[role="region"]') !== null) ?? null;
      const standalone = tablists.find((el) => el !== bar) ?? null;
      const rect = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
      };
      const hitOnFirstTab = (list: Element | null) => {
        if (!list) return null;
        const tab = list.querySelector('[role="tab"]');
        if (!tab) return null;
        const r = tab.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!el) return null;
        const listHit = el.closest('[role="tablist"]');
        return {
          isTab: el.closest('[role="tab"]') !== null,
          // 'bar' | 'standalone' | 'none' — em que tablist cai o clique
          list: listHit ? (listHit === list ? 'this' : listHit === bar ? 'bar' : 'other') : 'none',
          tag: el.tagName,
        };
      };
      return {
        barRect: rect(bar),
        standRect: rect(standalone),
        standVisibility: standalone ? getComputedStyle(standalone).visibility : null,
        barTop: (() => {
          const region = document.querySelector(
            '[role="region"][aria-label="Métricas principais"]',
          );
          return region ? getComputedStyle(region).top : null;
        })(),
        hitStandalone: hitOnFirstTab(standalone),
        hitBar: hitOnFirstTab(bar),
      };
    });
  }

  async function assertNoOverlap(page: Page) {
    const g = await probe(page);

    // As duas tablists existem (barra + linha standalone, esta escondida).
    expect(g.barRect).not.toBeNull();
    expect(g.standRect).not.toBeNull();

    // Cota e altura pelos tokens partilhados (nunca divergem).
    expect(g.barTop).toBe('64px');
    expect(g.barRect!.h).toBe(48);
    expect(g.standRect!.h).toBe(48);

    // A linha standalone fica INVISÍVEL quando a barra assume — nunca há duas
    // filas empilhadas (o overlap visual que o fix eliminou).
    expect(g.standVisibility).toBe('hidden');

    // Hit-test no centro do 1º tab da linha standalone: o clique cai num tab
    // DA BARRA — nada cobre os tabs da barra nem a posição da linha antiga.
    expect(g.hitStandalone).toMatchObject({ isTab: true, list: 'bar' });

    // Os tabs da barra estão realmente clicáveis (hit-test próprio).
    expect(g.hitBar).toMatchObject({ isTab: true, list: 'this' });
  }

  test('desktop: a barra não cobre os sport tabs após scroll', async ({ page }) => {
    await scrollUntilSticky(page);
    await assertNoOverlap(page);
  });

  test.describe('mobile (390×844, com scroll)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a barra não cobre os sport tabs em ecrãs pequenos', async ({ page }) => {
      await scrollUntilSticky(page);
      await assertNoOverlap(page);
    });
  });
});