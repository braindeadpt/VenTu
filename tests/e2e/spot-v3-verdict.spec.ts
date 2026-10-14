import { test, expect, type Page } from '@playwright/test';
import { axisRects, heroClipped, openSpotV6 as openSpot, overlaps } from './helpers/spotV6';

/**
 * SP-A → v6 (#184): geometria e colisões da página de spot «Atlântico».
 *
 *  §1 acções — numa única linha (390/768/1440), ≥ 44 px, sem sobreposição,
 *     um único CTA cheio («Como chegar»). Na v6 vivem numa linha própria
 *     (`spot-acoes`) por baixo do Porquê e da praia em 3D.
 *  §2 régua — substitui a barra unificada: no telemóvel fica FIXA em baixo
 *     (sempre no ecrã, também depois do scroll); no desktop (≥ 1024) fica
 *     sticky no TOPO quando o hero sai; o selector Kite · Surf vive na barra
 *     de topo sobre a foto (um só `role="group"`, botões ≥ 44 × 76).
 *  §3 eixo da régua — etiquetas sem sobreposição em píxeis; tooltip do
 *     desktop mostra hora + nota ao pairar; nada cria overflow horizontal.
 */

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;

/** Rects dos alvos da linha de acções. */
async function actionRects(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="spot-acoes"]');
    if (!row) return [];
    // Alvos de topo: links e botões directos (o popover do alerta/menu «Mais»
    // não está aberto).
    return Array.from(row.querySelectorAll('a, button'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          right: Math.round(r.right),
          h: Math.round(r.height),
          w: Math.round(r.width),
          text: (el.textContent ?? '').trim().slice(0, 24),
        };
      })
      .sort((a, b) => a.left - b.left);
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`SP-A @ ${vp.name}px`, () => {
    test.use({ serviceWorkers: 'block', viewport: { width: vp.width, height: vp.height } });

    test('§1 acções: uma linha, ≥44 px, sem sobreposição, um só CTA cheio', async ({ page }) => {
      await openSpot(page);
      await page.getByTestId('spot-acoes').scrollIntoViewIfNeeded();
      const rects = await actionRects(page);
      expect(rects.length).toBeGreaterThanOrEqual(4); // CTA + ♡ + alerta + cam/mais

      // Uma só linha (o bug S10 eram 3 linhas no mobile).
      const tops = new Set(rects.map((r) => r.top));
      expect(tops.size, JSON.stringify(rects)).toBe(1);
      for (const r of rects) expect(r.h, r.text).toBeGreaterThanOrEqual(44);
      expect(overlaps(rects)).toEqual([]);

      // Exactamente UM CTA cheio — «Como chegar» (Google Maps).
      const filled = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="spot-acoes"] .acao.primaria')).filter(
          (el) =>
            getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            (el.getAttribute('href') ?? '').includes('google.com/maps/dir'),
        ).length,
      );
      expect(filled).toBe(1);

      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(fits).toBe(true);
    });

    test('§2 régua: fixa em baixo no telemóvel, sticky no topo no desktop', async ({ page }) => {
      await openSpot(page);
      // Um só selector de modalidade na página, na barra de topo.
      await expect(page.getByRole('group', { name: 'Modalidade', exact: true })).toHaveCount(1);
      await expect(page.getByRole('tablist')).toHaveCount(0);

      const geo = () =>
        page.evaluate(() => {
          const r = document.querySelector('[data-testid="regua-48h"]')!.getBoundingClientRect();
          const s = document.querySelector('[role="slider"]')!.getBoundingClientRect();
          const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
          return {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            vh: window.innerHeight,
            pos: getComputedStyle(document.querySelector('[data-testid="regua-48h"]')!).position,
            hitInSlider: !!hit?.closest('[role="slider"]'),
          };
        });
      const desktop = vp.width >= 1024;
      const g0 = await geo();
      if (!desktop) {
        expect(g0.pos).toBe('fixed');
        expect(Math.abs(g0.bottom - g0.vh)).toBeLessThanOrEqual(1);
      } else {
        expect(g0.pos).toBe('sticky');
        // Por baixo do hero, no fluxo.
        expect(g0.top).toBeGreaterThan(0);
      }
      // Depois do scroll a régua continua no ecrã e nada a cobre (hit-test).
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(250);
      const g1 = await geo();
      if (!desktop) expect(Math.abs(g1.bottom - g1.vh)).toBeLessThanOrEqual(1);
      else expect(g1.top).toBe(0);
      expect(g1.hitInSlider).toBe(true);
    });

    test('§3 eixo da régua: etiquetas sem sobreposição em píxeis', async ({ page }) => {
      await openSpot(page);
      await page.waitForTimeout(400); // fontes e layout
      const rects = await axisRects(page);
      expect(rects.length).toBeGreaterThanOrEqual(2); // dias sempre ancoram
      expect(overlaps(rects, 4)).toEqual([]);
    });

    test('sem clipping de texto no hero e na régua', async ({ page }) => {
      await openSpot(page);
      expect(await heroClipped(page)).toEqual([]);
    });
  });
}

/**
 * #194 — a 390 px o nome e a linha «quando» não podem transbordar (Guincho e
 * Nazaré, PT e EN).
 */
const CLIP_SPOTS = [
  { url: '/pt/spots/guincho/', name: /Guincho/i },
  { url: '/en/spots/guincho/', name: /Guincho/i },
  { url: '/pt/spots/nazare/', name: /Nazar/i },
  { url: '/en/spots/nazare/', name: /Nazar/i },
] as const;

test.describe('SP-A @ 390px — hero sem clipping em PT/EN', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  for (const s of CLIP_SPOTS) {
    test(`sem clipping de texto no hero — ${s.url}`, async ({ page }) => {
      await openSpot(page, { url: s.url, name: s.name, alinhar: false });
      expect(await heroClipped(page)).toEqual([]);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(fits).toBe(true);
    });
  }
});

test.describe('SP-D — prefers-reduced-motion', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

  test('trocar de modalidade e de hora não deixa animações em curso', async ({ page }) => {
    await openSpot(page);
    // Troca de modalidade (a pista do selector deslizaria).
    const grupo = page.getByRole('group', { name: 'Modalidade', exact: true });
    const botoes = grupo.getByRole('button');
    const n = await botoes.count();
    for (let i = 0; i < n; i++) {
      if ((await botoes.nth(i).getAttribute('aria-pressed')) !== 'true') {
        await botoes.nth(i).click();
        break;
      }
    }
    await expect(page.getByTestId('spot-v6')).toHaveAttribute('data-modalidade', /kite|surf/);
    // Troca de hora (a agulha deslizaria 150 ms; a foto teria Ken Burns).
    const rail = page.getByRole('slider');
    await rail.focus();
    await rail.press('ArrowRight');
    await page.waitForTimeout(150);
    // Nenhuma animação/transição com duração real: a guarda global reduz
    // tudo a 0,01 ms. As de 0,01 ms acabam no frame seguinte — num browser
    // lento (software GL) ainda podem aparecer «running» por um frame, por
    // isso espera-se que esvaziem.
    const reais = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.getComputedTiming();
        const dur = Number(t?.duration ?? 0) + Number(t?.delay ?? 0);
        return a.playState === 'running' && dur > 0.01;
      }).map((a) => {
        const x = a as CSSAnimation & CSSTransition;
        const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return `${x.animationName ?? x.transitionProperty}@${t?.tagName ?? '?'}.${String(t?.className ?? '').slice(0, 40)}`;
      }),
    );
    expect(reais).toEqual([]);
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), { timeout: 2_000 })
      .toBe(0);
  });
});

test.describe('SP-A — tooltip da régua (desktop)', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });

  test('hover mostra hora e nota no tooltip', async ({ page }) => {
    await openSpot(page);
    const rail = page.getByRole('slider');
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    const antes = await rail.getAttribute('aria-valuenow');
    await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height / 2);
    const tip = page.getByTestId('spot-rail-tooltip');
    await expect(tip).toBeVisible();
    // «qui 15, 18h · 7/10» (ou a banda «Noite»).
    await expect(tip).toContainText(/\d{1,2}h · ((10|\d)\/10|Noite)/);
    // Pairar não muda a hora escolhida.
    expect(await rail.getAttribute('aria-valuenow')).toBe(antes);
  });

  test('o tooltip desaparece ao sair da régua', async ({ page }) => {
    await openSpot(page);
    const rail = page.getByRole('slider');
    const box = await rail.boundingBox();
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
    await expect(page.getByTestId('spot-rail-tooltip')).toBeVisible();
    await page.mouse.move(10, 600);
    await expect(page.getByTestId('spot-rail-tooltip')).toBeHidden();
  });
});
