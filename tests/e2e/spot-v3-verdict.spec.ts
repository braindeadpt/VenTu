import { test, expect, type Page } from '@playwright/test';

/**
 * SP-A — UX v3 §1–3 (docs/design/SPOT-UX-V3.md): geometria e colisões.
 *
 *  §1 hero — acções numa única linha (390/768/1440), sem sobreposição de
 *     caixas, um único CTA cheio; etiquetas <640 px são só ícone.
 *  §2 barra — escondida enquanto o hero está no ecrã; aparece pinned a
 *     64 px depois do scroll; chip score+hora fica fixo à direita no mobile
 *     (gradiente de 24 px por trás) e as âncoras só existem no desktop.
 *  §3 régua — eixo sem etiquetas sobrepostas (a decisão é em píxeis no
 *     componente; aqui confirma-se nas caixas renderizadas), tooltip do
 *     desktop mostra hora+score ao pairar, e nada cria overflow horizontal.
 */

const SPOT_URL = '/pt/spots/guincho/';
const BAR_LABEL = 'Modalidade e hora escolhida';
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;

async function openSpot(page: Page) {
  await page.goto(SPOT_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: /Guincho/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('slider')).toBeVisible({ timeout: 20_000 });
  await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
}

/** Rects dos botões/links da linha de acções do hero (dentro de #agora). */
async function actionRects(page: Page) {
  return page.evaluate(() => {
    const hero = document.querySelector('#agora');
    if (!hero) return [];
    // A linha de acções é o flex que contém o CTA «Como chegar».
    const cta = Array.from(hero.querySelectorAll('a, button')).find((el) =>
      (el.getAttribute('href') ?? '').includes('google.com/maps/dir'),
    );
    const row = cta?.closest('div');
    if (!cta || !row) return [];
    const els = Array.from(row.querySelectorAll('a, button'));
    return els
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

/** Rects das etiquetas visíveis do eixo da régua. */
async function axisRects(page: Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[role="slider"]');
    const axis = rail?.parentElement?.querySelector('div[aria-hidden="true"].relative.h-6')
      ?? rail?.nextElementSibling;
    if (!axis) return [];
    return Array.from(axis.querySelectorAll('span'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, text: el.textContent ?? '' };
      })
      .sort((a, b) => a.left - b.left);
  });
}

const overlaps = (
  rects: { left: number; right: number }[],
  minGap = 0,
): [string, string][] => {
  const bad: [string, string][] = [];
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].left < rects[i - 1].right + minGap) {
      bad.push([String(i - 1), String(i)]);
    }
  }
  return bad;
};

for (const vp of VIEWPORTS) {
  test.describe(`SP-A @ ${vp.name}px`, () => {
    test.use({
      serviceWorkers: 'block',
      viewport: { width: vp.width, height: vp.height },
    });

    test('§1 acções do hero: uma linha, ≥44 px, sem sobreposição', async ({
      page,
    }) => {
      await openSpot(page);
      const rects = await actionRects(page);
      expect(rects.length).toBeGreaterThanOrEqual(4); // CTA + ♡ + alerta + cam/more

      // Uma só linha — o bug S10 era 3 linhas no mobile.
      const tops = new Set(rects.map((r) => r.top));
      expect(tops.size).toBe(1);

      // Alvos ≥44 px de altura e sem caixas sobrepostas.
      for (const r of rects) {
        expect(r.h).toBeGreaterThanOrEqual(44);
      }
      expect(overlaps(rects)).toEqual([]);

      // Exactamente UM CTA cheio (bg-accent) — «Como chegar».
      const filled = await page.evaluate(() => {
        const hero = document.querySelector('#agora');
        if (!hero) return 0;
        return Array.from(hero.querySelectorAll('a, button')).filter(
          (el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'
            && el.className.includes('bg-accent'),
        ).length;
      });
      expect(filled).toBe(1);

      // Sem overflow horizontal da página.
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits).toBe(true);
    });

    test('§2 barra: escondida no hero, pinned a 64 px após scroll', async ({
      page,
    }) => {
      await openSpot(page);
      const bar = page.getByRole('region', { name: BAR_LABEL });

      // Enquanto o hero está no ecrã a barra está escondida (v3 §2).
      await expect(bar).toBeHidden();

      // Depois do scroll: pinned a 64 px, visível, sem sobrepor o chip.
      await page.evaluate(() => window.scrollTo(0, 1600));
      await expect(bar).toBeVisible();
      // Espera a transição de entrada (200 ms) assentar antes de medir.
      await page.waitForTimeout(350);

      const g = await page.evaluate(() => {
        const el = document.querySelector(
          `[role="region"][aria-label="${'Modalidade e hora escolhida'}"]`,
        );
        const r = el?.getBoundingClientRect();
        const chip = el?.querySelector('[data-testid="spot-bar-score"]');
        const cr = chip?.getBoundingClientRect();
        const nav = el?.querySelector('nav');
        const nr = nav?.getBoundingClientRect();
        return {
          top: r ? Math.round(r.top) : null,
          chipRight: cr ? Math.round(cr.right) : null,
          navVisible: nr ? nr.width > 0 : false,
          vw: window.innerWidth,
        };
      });
      expect(g.top).toBe(64);
      expect(g.chipRight).not.toBeNull();
      // O chip fica dentro do viewport à direita (não é empurrado para fora).
      expect(g.chipRight!).toBeLessThanOrEqual(g.vw);
      expect(g.chipRight!).toBeGreaterThan(g.vw * 0.5);
      // Âncoras só no desktop (≥1024) — escondidas em 390 e 768.
      expect(g.navVisible).toBe(vp.width >= 1024);

      // A última tab tem de conseguir sair debaixo do chip: com o tablist no
      // fim do scroll, o bordo direito da última tab fica à esquerda do chip
      // (a zona de 24 px do gradiente pertence ao chip).
      const cleared = await page.evaluate(() => {
        const el = document.querySelector(
          `[role="region"][aria-label="${'Modalidade e hora escolhida'}"]`,
        );
        const list = el?.querySelector('[role="tablist"]');
        if (!list) return null;
        list.scrollLeft = list.scrollWidth; // fim do scroll
        const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
        const last = tabs[tabs.length - 1];
        const chipGroup = el!.querySelector('[data-testid="spot-bar-score"]')
          ?.parentElement;
        if (!last || !chipGroup) return null;
        const lr = last.getBoundingClientRect();
        const cr = chipGroup.getBoundingClientRect();
        return { lastRight: lr.right, chipLeft: cr.left };
      });
      expect(cleared).not.toBeNull();
      expect(cleared!.lastRight).toBeLessThanOrEqual(cleared!.chipLeft + 1);
    });

    test('§3 eixo da régua: etiquetas sem sobreposição em píxeis', async ({
      page,
    }) => {
      await openSpot(page);
      await page.locator('#quando').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400); // ResizeObserver + medida de fontes

      const rects = await axisRects(page);
      expect(rects.length).toBeGreaterThanOrEqual(2); // dias sempre ancoram
      expect(overlaps(rects, 4)).toEqual([]);
    });

    test('sem clipping de texto no hero e na régua', async ({ page }) => {
      await openSpot(page);
      const clipped = await page.evaluate(() => {
        const out: string[] = [];
        // Elementos truncados por design (truncate) devem ter scrollWidth
        // <= clientWidth... não — truncate CORTA texto. Aqui verificamos o
        // contrário: nenhum texto visível está cortado por overflow sem
        // ellipsis intencional. Medimos os blocos que não são truncate.
        const hero = document.querySelector('#agora');
        hero?.querySelectorAll('h1, p').forEach((el) => {
          if (el.classList.contains('truncate')) return;
          if (el.scrollWidth > el.clientWidth + 1) {
            out.push(el.tagName + ':' + (el.textContent ?? '').slice(0, 30));
          }
        });
        return out;
      });
      expect(clipped).toEqual([]);
    });
  });
}

test.describe('SP-A — tooltip da régua (desktop)', () => {
  test.use({
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 900 },
  });

  test('hover mostra hora e score no tooltip', async ({ page }) => {
    await openSpot(page);
    const rail = page.getByRole('slider');
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();

    // Paira a meio da régua — o tooltip segue o cursor.
    await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height / 2);
    const tip = page.getByTestId('spot-rail-tooltip');
    await expect(tip).toBeVisible();
    // «14:00 · 72 …» — hora local + score (e métricas se o fetch resolveu).
    await expect(tip).toContainText(/\d{2}:\d{2} · \d{1,3}/);
  });

  test('o tooltip desaparece ao sair da régua', async ({ page }) => {
    await openSpot(page);
    const rail = page.getByRole('slider');
    const box = await rail.boundingBox();
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
    await expect(page.getByTestId('spot-rail-tooltip')).toBeVisible();
    await page.mouse.move(10, 10);
    await expect(page.getByTestId('spot-rail-tooltip')).toBeHidden();
  });
});
