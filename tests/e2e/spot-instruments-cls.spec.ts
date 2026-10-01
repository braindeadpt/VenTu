import { test, expect, type Page } from '@playwright/test';

/**
 * Sonda de CLS nos instrumentos — CPU a 4×, nas três larguras que a auditoria
 * pediu (1350 · 390 · 320), com as linhas do spot a trazer `ens` para a banda
 * entrar em cena durante o carregamento (é exactamente a troca «HTML de partida
 * → relógio vivo» que o f2508ce66 fazia saltar).
 *
 * A sonda vive no documento desde o primeiro paint (`addInitScript`), acumula
 * TODOS os layout-shifts sem input recente e marca cada um com a atribuição:
 * o shift mexeu em algo dentro de `#instrumentos` (a secção, um cartão ou o
 * painel de detalhe)? A asserção é essa — um shift > 0,01 atribuível aos
 * instrumentos falha o teste.
 *
 * A sonda tem um controlo: no fim, o spec injecta um shift DENTRO da secção e
 * exige que a mesma atribuição o apanhe. Sem isso, um observer que nunca
 * recebesse entradas passaria o teste a fingir de verde.
 */

declare global {
  interface Window {
    __clsShifts?: { value: number; inside: boolean; sources: string }[];
  }
}

const WIDTHS = [1350, 390, 320] as const;
const SECTION = '#instrumentos';

type Shift = { value: number; inside: boolean; sources: string };

async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__clsShifts = [];
    const tag = (node: Node | null): string => {
      if (!node) return '(sem nó)';
      const el = node as HTMLElement;
      const name = el.tagName ? el.tagName.toLowerCase() : '?';
      const id = el.id ? `#${el.id}` : '';
      const attr = el.getAttribute?.('data-instrument');
      const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
      return `${name}${id}${attr ? `[${attr}]` : ''}${cls ? `.${cls}` : ''}`;
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          sources?: { node: Node | null }[];
        }[]) {
          if (entry.hadRecentInput) continue;
          const anchor = document.querySelector('#instrumentos');
          const sources = entry.sources ?? [];
          const inside = sources.some((s) => {
            const node = s.node;
            if (!node || !anchor) return false;
            return anchor === node || anchor.contains(node);
          });
          window.__clsShifts?.push({
            value: entry.value,
            inside,
            sources: sources.map((s) => tag(s.node)).join('|'),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* ambiente sem layout-shift — o teste falha no controlo, não passa a fingir */
    }
  });
}

/** Serve as linhas reais do spot com uma banda determinística por hora. */
async function stubBands(page: Page): Promise<void> {
  await page.route('**/data/forecasts/*.json', async (route) => {
    const rows = (await (await route.fetch()).json()) as Record<string, unknown>[];
    const out = rows.map((row) => {
      const h = Number.isFinite(Number(row.waveHeight)) ? Number(row.waveHeight) : 1.5;
      const w = Number.isFinite(Number(row.windSpeed)) ? Number(row.windSpeed) : 7;
      const q = (v: number, d = 2) => Number(v.toFixed(d));
      return {
        ...row,
        ens: [
          q(Math.max(0, h - 0.4)),
          q(h),
          q(h + 0.5),
          q(Math.max(0, w - 0.5), 1),
          q(w, 1),
          q(w + 0.8, 1),
          4,
          4,
        ],
      };
    });
    await route.fulfill({ json: out });
  });
}

const readShifts = (page: Page): Promise<Shift[]> =>
  page.evaluate(() => (window.__clsShifts ?? []).map((s) => ({ ...s })));

const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 1500)));
      }),
  );

for (const width of WIDTHS) {
  test.describe(`CLS — instrumentos a ${width}px (CPU 4×)`, () => {
    test.use({ serviceWorkers: 'block', viewport: { width, height: 900 } });

    test('sem shifts > 0,01 atribuíveis aos instrumentos', async ({ page }) => {
      // CPU 4×: a hidratação e a troca do snapshot pelas linhas ficam lentas —
      // é onde um cartão que muda de altura se denuncia.
      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await installProbe(page);
      await stubBands(page);
      await page.goto('/pt/spots/guincho/');
      await expect(
        page.locator(`${SECTION} [data-instrument-rows='ready']`).first(),
      ).toBeVisible({ timeout: 30_000 });
      // A banda já está desenhada (a troca aconteceu) e a página assentou.
      await expect(page.locator(`${SECTION} [data-wave-band='card']`).first()).toBeVisible({
        timeout: 20_000,
      });
      await settle(page);

      const shifts = await readShifts(page);
      const inside = shifts.filter((s) => s.inside);
      const offenders = inside.filter((s) => s.value > 0.01);
      expect(
        offenders,
        `shifts > 0,01 na secção de instrumentos a ${width}px: ${JSON.stringify(offenders)}`,
      ).toEqual([]);
      // Diagnóstico (não é o critério): total acumulado e o pior shift da página.
      const total = shifts.reduce((a, s) => a + s.value, 0);
      const worst = shifts.reduce((a, s) => Math.max(a, s.value), 0);
      console.log(
        `[cls ${width}px] total=${total.toFixed(4)} pior=${worst.toFixed(4)} ` +
          `dentro=${inside.length}/${shifts.length} ${JSON.stringify(shifts.slice(0, 6))}`,
      );

      // Controlo: um shift injectado DENTRO da secção tem de ser atribuído à
      // secção — prova que a sonda não está vácua. A secção tem de estar no
      // ecrã (o layout-shift só conta elementos visíveis) e o scroll tem de
      // assentar antes (input recente não conta).
      await page.locator(SECTION).scrollIntoViewIfNeeded();
      await settle(page);
      await page.evaluate(() => {
        const host = document.querySelector('#instrumentos > div');
        if (host instanceof HTMLElement) host.style.paddingTop = '160px';
      });
      await settle(page);
      const after = await readShifts(page);
      const control = after.filter((s) => s.inside && s.value > 0.01);
      expect(
        control.length,
        `a sonda não apanhou o shift de controlo — entradas: ${JSON.stringify(
          after.slice(-4),
        )}`,
      ).toBeGreaterThan(0);
    });
  });
}
