import { test, expect, type Page } from '@playwright/test';
import { openSpotV6 as openSpot } from './helpers/spotV6';

/**
 * Régua de 48 h v6 (#184) — geometria do elemento fixo que substitui a antiga
 * SpotUnifiedBar. Garantias:
 *  - há UMA régua (`role="slider"`) e UM selector de modalidade na página, e
 *    nenhum tablist antigo;
 *  - telemóvel (390 × 844): `position: fixed` encostada ao fundo do ecrã,
 *    antes e depois do scroll; as setas ‹ › medem ≥ 44 × 44; um clique no
 *    centro do slider cai no slider (hit-test, nada a cobre);
 *  - desktop (1440 × 900): `position: sticky; top: 0` — no fluxo por baixo do
 *    hero e, depois do scroll, presa ao topo (o cabeçalho do site está
 *    escondido nesta rota, por isso a cota é 0); hit-test igual;
 *  - as cotas partilhadas do resto da página (`--ventu-spot-sticky-top`,
 *    `--ventu-spot-tabs-h`) ficam a 0 na rota v6 — nada fica preso por baixo
 *    de um cabeçalho que não existe.
 */

async function probe(page: Page) {
  return page.evaluate(() => {
    const regua = document.querySelector('[data-testid="regua-48h"]') as HTMLElement | null;
    const s = regua?.querySelector('[role="slider"]');
    const r = regua?.getBoundingClientRect();
    const sr = s?.getBoundingClientRect();
    const hit = sr ? document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2) : null;
    const setas = Array.from(regua?.querySelectorAll('.r-cab button') ?? []).map((b) => {
      const x = b.getBoundingClientRect();
      return { w: Math.round(x.width), h: Math.round(x.height) };
    });
    const root = getComputedStyle(document.documentElement);
    return {
      sliders: document.querySelectorAll('[role="slider"]').length,
      grupos: document.querySelectorAll('[data-testid="modalidade-toggle"]').length,
      tablists: document.querySelectorAll('[role="tablist"]').length,
      pos: regua ? getComputedStyle(regua).position : null,
      cssTop: regua ? getComputedStyle(regua).top : null,
      top: r ? Math.round(r.top) : null,
      bottom: r ? Math.round(r.bottom) : null,
      vh: window.innerHeight,
      hitInSlider: !!hit?.closest('[role="slider"]'),
      setas,
      stickyTop: root.getPropertyValue('--ventu-spot-sticky-top').trim(),
      tabsH: root.getPropertyValue('--ventu-spot-tabs-h').trim(),
    };
  });
}

async function scrollPastHero(page: Page) {
  // Logo a seguir ao hero: no desktop a régua só é sticky dentro da página v6.
  await page.evaluate(() => {
    const h = document.querySelector('#agora') as HTMLElement;
    window.scrollTo(0, h.getBoundingClientRect().bottom + window.scrollY + 80);
  });
  await expect
    .poll(async () => page.evaluate(() => (document.querySelector('#agora') as HTMLElement).getBoundingClientRect().bottom < 0), {
      timeout: 3_000,
    })
    .toBe(true);
  await page.waitForTimeout(200);
}

function assertComum(g: Awaited<ReturnType<typeof probe>>) {
  expect(g.sliders).toBe(1);
  expect(g.grupos).toBe(1);
  expect(g.tablists).toBe(0);
  expect(g.hitInSlider).toBe(true);
  expect(g.setas).toHaveLength(2);
  for (const s of g.setas) {
    expect(s.w).toBeGreaterThanOrEqual(44);
    expect(s.h).toBeGreaterThanOrEqual(44);
  }
  expect(g.stickyTop).toBe('0px');
  expect(g.tabsH).toBe('0px');
}

test.describe('Régua v6 — elemento fixo único (desktop + mobile)', () => {
  test.use({ serviceWorkers: 'block' });

  test.describe('desktop (1440×900)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('sticky a 0 por baixo do hero; presa ao topo depois do scroll', async ({ page }) => {
      await openSpot(page);
      const g0 = await probe(page);
      assertComum(g0);
      expect(g0.pos).toBe('sticky');
      expect(g0.cssTop).toBe('0px');
      expect(g0.top!).toBeGreaterThan(0);
      await scrollPastHero(page);
      const g1 = await probe(page);
      assertComum(g1);
      expect(g1.top).toBe(0);
    });
  });

  test.describe('mobile (390×844, com scroll)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('a régua fica fixa em baixo e clicável em ecrã pequeno', async ({ page }) => {
      await openSpot(page);
      const g0 = await probe(page);
      assertComum(g0);
      expect(g0.pos).toBe('fixed');
      expect(Math.abs(g0.bottom! - g0.vh)).toBeLessThanOrEqual(1);
      await scrollPastHero(page);
      const g1 = await probe(page);
      assertComum(g1);
      expect(Math.abs(g1.bottom! - g1.vh)).toBeLessThanOrEqual(1);
    });
  });
});
