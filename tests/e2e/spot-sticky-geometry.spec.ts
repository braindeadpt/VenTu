import { test, expect, type Page } from '@playwright/test';

/**
 * SpotUnifiedBar (v3 §2) — geometria da barra fixa única.
 *
 * UMA barra (`role="region"` «Modalidade e hora escolhida») que está sempre
 * no fluxo e pina em `top: var(--ventu-spot-sticky-top)` = 64px. Na v3 ela
 * só APARECE quando o hero (#agora) sai do ecrã — translateY(-100%→0) +
 * opacity em 200 ms. Garantias:
 *  - existe exactamente UM tablist na página e está dentro da barra;
 *  - a barra mede 48px (`--ventu-spot-tabs-h`) e a cota computada é 64px;
 *  - com o hero visível a barra está escondida (translateY(-100%) +
 *    invisible); depois do scroll fica pinned a 64px do topo e um clique no
 *    centro do 1º tab cai num tab da própria barra (hit-test);
 *  - igual em mobile 390px, onde a fila de tabs rola horizontalmente por
 *    baixo do chip fixo da direita.
 *
 * Os tokens (cota 64px, altura 48px) vêm do globals.css; a guarda unitária
 * (spacingTokens.test.ts) impede que voltem a hard-codar.
 */
const BAR_LABEL = 'Modalidade e hora escolhida';

test.describe('SpotUnifiedBar — barra fixa única (desktop + mobile)', () => {
  test.use({ serviceWorkers: 'block' });

  async function openSpot(page: Page) {
    await page.goto('/pt/spots/guincho/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });
    // A barra existe no DOM desde o primeiro render — escondida enquanto o
    // hero estiver no ecrã (IntersectionObserver decide depois de montar).
    // Enquanto `invisible` ela sai da árvore de acessibilidade, por isso a
    // sonda é CSS (`toBeAttached`), não getByRole.
    await expect(
      page.locator(`[role="region"][aria-label="${BAR_LABEL}"]`),
    ).toBeAttached({ timeout: 20_000 });
  }

  /** Sonda: nº de tablists, geometria da barra e hit-test no 1º tab. */
  async function probe(page: Page) {
    return page.evaluate((label) => {
      const barEl = document.querySelector(`[role="region"][aria-label="${label}"]`);
      const tablists = Array.from(document.querySelectorAll('[role="tablist"]'));
      const r = barEl?.getBoundingClientRect();
      const tl = barEl?.querySelector('[role="tablist"]');
      const tlr = tl?.getBoundingClientRect();
      const tab = barEl?.querySelector('[role="tab"]') ?? null;
      const tr = tab?.getBoundingClientRect();
      const hit =
        tr && tr.width > 0
          ? document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2)
          : null;
      return {
        barTop: barEl ? getComputedStyle(barEl).top : null,
        barRect: r ? { top: Math.round(r.top), h: Math.round(r.height) } : null,
        hidden: barEl ? barEl.classList.contains('invisible') : null,
        tablistH: tlr ? Math.round(tlr.height) : null,
        tablistCount: tablists.length,
        tablistsInBar: barEl ? tablists.filter((t) => barEl.contains(t)).length : 0,
        hitIsTabInBar:
          hit && barEl ? barEl.contains(hit.closest('[role="tab"]')) && !!hit.closest('[role="tab"]') : null,
      };
    }, BAR_LABEL);
  }

  async function assertGeometry(page: Page, { scrolled }: { scrolled: boolean }) {
    const g = await probe(page);

    // Uma só tablist na página — a linha standalone já não existe.
    expect(g.tablistCount).toBe(1);
    expect(g.tablistsInBar).toBe(1);

    // Cota e altura pelos tokens partilhados — a fila de tabs mede 48px
    // (--ventu-spot-tabs-h); a região soma a border-b (49px no rect).
    expect(g.barTop).toBe('64px');
    expect(g.tablistH).toBe(48);

    if (scrolled) {
      // Depois do scroll a barra está visível e pinned a 64px do topo.
      expect(g.hidden).toBe(false);
      expect(g.barRect!.top).toBe(64);
      // Hit-test: o clique no 1º tab cai num tab desta barra — nada cobre.
      expect(g.hitIsTabInBar).toBe(true);
    } else {
      // Com o hero no ecrã a barra está fora (v3 §2 — aparece ao sair).
      expect(g.hidden).toBe(true);
    }
  }

  async function scrollPastHero(page: Page) {
    await page.evaluate(() => window.scrollTo(0, 1500));
    // Espera a entrada (translateY+opacity 200 ms) assentar antes de medir.
    await page.waitForTimeout(350);
  }

  test('desktop: uma só tablist, cota 64px, escondida no hero e pinned após scroll', async ({ page }) => {
    await openSpot(page);
    await assertGeometry(page, { scrolled: false });
    await scrollPastHero(page);
    await assertGeometry(page, { scrolled: true });
  });

  test.describe('mobile (390×844, com scroll)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a barra pina e os tabs ficam clicáveis em ecrã pequeno', async ({ page }) => {
      await openSpot(page);
      await assertGeometry(page, { scrolled: false });
      await scrollPastHero(page);
      await assertGeometry(page, { scrolled: true });
    });
  });
});
