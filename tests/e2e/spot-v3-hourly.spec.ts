import { test, expect, type Page } from '@playwright/test';

/**
 * SP-B — «Hora a hora» (SPOT-UX-V3 §5): lista vertical mobile (<768 px)
 * agrupada por dia com cabeçalhos sticky, 24 h + «Mostrar mais 24 h»,
 * linha seleccionada a --verdict/12 e toque a mudar o índice do eixo.
 * Desktop (≥768 px): tabela com 1.ª coluna fixa, separadores de dia,
 * coluna «agora» contornada a fg 30% e coluna escolhida a --verdict.
 *
 * A lista/tabela NÃO re-renderiza por passo de scrub — o destaque é
 * imperativo (ForecastTimelineSync, medido por window.__ventuFtRenders
 * em spot-v2-forecast.spec.ts).
 */

const SECTION = '#previsao';
const INSTRUMENTS = '#instrumentos';
const LIST = `${SECTION} .forecast-hourly-list`;
const ROW = `${LIST} [data-tl-col]`;
const DAY_HEADER = `${LIST} .forecast-day-header`;
// Página de spot v6 (#184): sem cabeçalho do site nem barra unificada nesta
// rota — as cotas partilhadas (--ventu-spot-sticky-top + --ventu-spot-tabs-h)
// ficam a 0 e os cabeçalhos de dia prendem-se ao topo do ecrã.
const STICKY_TOP = 0;

/** Índice global da timeline — verdade lida nos instrumentos. */
async function globalIndex(page: Page): Promise<number> {
  return Number(
    await page.locator(INSTRUMENTS).getAttribute('data-spot-timeline-index'),
  );
}

async function gotoGuincho({ page }: { page: Page }) {
  await page.goto('/pt/spots/guincho/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Guincho/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(SECTION)).toHaveAttribute(
    'data-spot-timeline-index',
    /\d+/,
    { timeout: 20_000 },
  );
  // O índice aterra na hora corrente num effect — /\d+/ passa já no 0
  // inicial. Espera a aterragem: a 1.ª célula data-tl-col é a hora
  // corrente (lista mobile e tabela desktop partilham o mesmo início).
  // A 1.ª coluna só é a hora viva depois de o eixo montar (como em
  // spot-v2-forecast): antes a lista fatia pelo relógio do bake.
  await expect(page.locator(INSTRUMENTS)).toHaveAttribute(
    'data-spot-timeline-live',
    'true',
    { timeout: 20_000 },
  );
  const firstCol = await page
    .locator(`${SECTION} [data-tl-col]`)
    .first()
    .getAttribute('data-tl-col');
  await expect(page.locator(INSTRUMENTS)).toHaveAttribute(
    'data-spot-timeline-index',
    firstCol ?? '',
    { timeout: 10_000 },
  );
}

test.describe('SP-B — lista «Hora a hora» mobile (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(gotoGuincho);

  test('lista vertical por dia: 24 h iniciais, headers «Quarta, 23»', async ({
    page,
  }) => {
    await page.locator(LIST).scrollIntoViewIfNeeded();

    // Não há tabela horizontal nem meteograma.
    await expect(page.locator(`${SECTION} table`)).toHaveCount(0);
    await expect(page.locator(`${SECTION} [data-tl-meteogram]`)).toHaveCount(0);

    // 24 linhas, cada uma ≥56 px (altura da spec §5).
    const rows = page.locator(ROW);
    await expect(rows).toHaveCount(24);
    const firstBox = (await rows.first().boundingBox())!;
    expect(firstBox.height).toBeGreaterThanOrEqual(55);

    // CORRECCOES-24SET §3: a lista começa na hora ACTUAL — a 1.ª linha é
    // o índice global corrente e está realçada no primeiro ecrã.
    const now = await globalIndex(page);
    await expect(rows.first()).toHaveAttribute('data-tl-col', String(now));
    await expect(rows.first()).toHaveAttribute('data-tl-selected', '');

    // Cabeçalhos de dia na forma «Quarta, 23» (weekday longo + nº do dia).
    const headers = await page.locator(DAY_HEADER).allTextContents();
    expect(headers.length).toBeGreaterThanOrEqual(1);
    for (const h of headers) {
      expect(h.trim()).toMatch(/^.+, \d{1,2}$/);
    }
  });

  test('«Mostrar mais 24 h» revela as próximas 24', async ({ page }) => {
    await page.locator(LIST).scrollIntoViewIfNeeded();
    await expect(page.locator(ROW)).toHaveCount(24);

    const more = page.getByRole('button', { name: /Mostrar mais 24 h/i });
    await expect(more).toBeVisible();
    await more.click();
    await expect(page.locator(ROW)).toHaveCount(48);

    // E o botão continua disponível enquanto houver horas por mostrar.
    await more.click();
    await expect(page.locator(ROW)).toHaveCount(72);
  });

  test('toque numa linha muda a hora do veredicto e a selecção da régua', async ({
    page,
  }) => {
    const now = await globalIndex(page);
    const slider = page.getByRole('slider');
    const localNow = Number(await slider.getAttribute('aria-valuenow'));
    const offset = now - localNow;
    const v6 = page.getByTestId('spot-v6');
    const horaAntes = await v6.getAttribute('data-hora');

    await page.locator(LIST).scrollIntoViewIfNeeded();
    // Só linhas dentro da janela da régua — o slider clampa o valor.
    const sMin = Number(await slider.getAttribute('aria-valuemin')) || 0;
    const sMax = Number(await slider.getAttribute('aria-valuemax')) || 47;
    const cols = (
      await page
        .locator(ROW)
        .evaluateAll((els) =>
          els.map((el) => Number(el.getAttribute('data-tl-col'))),
        )
    ).filter((c) => c - offset >= sMin && c - offset <= sMax && c !== now);
    expect(cols.length).toBeGreaterThan(0);
    // Uma linha a meio da lista, para o salto ser real.
    const target = cols[Math.min(cols.length - 1, 5)];
    const row = page.locator(`${ROW}[data-tl-col="${target}"]`);
    const horaLinha = (await row.locator('span').first().textContent())?.trim() ?? '';
    await row.scrollIntoViewIfNeeded();
    await row.click();

    // O índice global propagou-se às secções instrumentadas.
    await expect(page.locator(INSTRUMENTS)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );
    await expect(page.locator(SECTION)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );
    // A régua aponta para a mesma hora (local = global − offset).
    await expect(slider).toHaveAttribute('aria-valuenow', String(target - offset));
    // A linha ficou seleccionada (destaque imperativo).
    await expect(row).toHaveAttribute('data-tl-selected', '');
    // O veredicto v6 mostra a hora da linha tocada (o mesmo objecto da hora).
    await expect(v6).not.toHaveAttribute('data-hora', horaAntes ?? '');
    const hh = horaLinha.match(/\d{1,2}/)?.[0];
    expect(hh, `hora da linha: «${horaLinha}»`).toBeTruthy();
    await expect(v6).toHaveAttribute('data-hora', new RegExp(`T${hh!.padStart(2, '0')}:00$`));
    await expect(page.getByTestId('spot-quando')).toContainText(`${Number(hh)}h`);
  });

  test('cabeçalhos de dia ficam sticky durante o scroll (bounding boxes)', async ({
    page,
  }) => {
    // Expande para ter ≥3 grupos de dia em jogo.
    const more = page.getByRole('button', { name: /Mostrar mais 24 h/i });
    await page.locator(LIST).scrollIntoViewIfNeeded();
    if (await more.isVisible()) await more.click();
    await expect(page.locator(ROW)).toHaveCount(48);

    // Faz scroll até ao meio do 2.º grupo — o seu header deve estar
    // preso no topo sem se sobrepor ao header seguinte.
    const secondHeader = page.locator(DAY_HEADER).nth(1);
    await secondHeader.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(150);

    const rects = await page.evaluate((stickyTop) => {
      return [...document.querySelectorAll('.forecast-day-header')].map((h) => {
        const r = h.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
    }, STICKY_TOP);

    // O header preso: topo encostado à cota sticky e ainda visível.
    const pinned = rects.filter(
      (r) => r.top <= STICKY_TOP + 2 && r.bottom > STICKY_TOP + 2,
    );
    expect(
      pinned.length,
      `nenhum cabeçalho de dia preso — tops: ${rects
        .map((r) => r.top.toFixed(0))
        .join(', ')}`,
    ).toBeGreaterThanOrEqual(1);

    // O header seguinte empurra o anterior — nunca se sobrepõem.
    const pinnedBottom = Math.max(...pinned.map((r) => r.bottom));
    const next = rects.find((r) => r.top > STICKY_TOP + 2);
    if (next) {
      expect(next.top).toBeGreaterThanOrEqual(pinnedBottom - 0.5);
    }
  });
});

test.describe('SP-B — colisões e texto cortado (todos os breakpoints)', () => {
  for (const width of [390, 768, 1440]) {
    test(`sem sobreposições nem elipses inesperadas a ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoGuincho({ page });
      await page.locator(SECTION).scrollIntoViewIfNeeded();

      const issues = await page.evaluate((sectionSel) => {
        const root = document.querySelector(sectionSel);
        if (!root) return ['secção em falta'];
        const out: string[] = [];
        const rect = (el: Element) => el.getBoundingClientRect();

        // 1. Linhas da lista mobile / células do header da tabela —
        //    elementos consecutivos não se podem sobrepor.
        const rows = [...root.querySelectorAll('.forecast-hourly-row')];
        for (let i = 1; i < rows.length; i++) {
          const a = rect(rows[i - 1]);
          const b = rect(rows[i]);
          if (
            a.top < b.bottom - 0.5 &&
            b.top < a.bottom - 0.5 &&
            a.left < b.right - 0.5 &&
            b.left < a.right - 0.5
          ) {
            out.push(`linhas ${i - 1}/${i} sobrepostas`);
          }
        }
        const headCells = [
          ...root.querySelectorAll('.forecast-table-scroll thead th'),
        ];
        for (let i = 1; i < headCells.length; i++) {
          const a = rect(headCells[i - 1]);
          const b = rect(headCells[i]);
          if (
            a.top < b.bottom - 0.5 &&
            b.top < a.bottom - 0.5 &&
            a.left < b.right - 0.5 &&
            b.left < a.right - 0.5
          ) {
            out.push(`colunas do header ${i - 1}/${i} sobrepostas`);
          }
        }

        // 2. Elipses: rótulos das linhas da tabela, cabeçalhos de dia e a
        //    célula de onda da lista não podem estar cortados
        //    (scrollWidth > clientWidth). CORRECCOES-24SET §3 — já não há
        //    .truncate na lista; a guarda fica para qualquer recaída.
        const checkOverflow = (el: Element, what: string) => {
          if (
            !el.classList.contains('truncate') &&
            el.scrollWidth > el.clientWidth + 1
          ) {
            out.push(`texto cortado: ${what} («${el.textContent?.trim()}»)`);
          }
        };
        root
          .querySelectorAll('.forecast-table-scroll th[scope="row"]')
          .forEach((el, i) => checkOverflow(el, `rótulo linha ${i}`));
        root
          .querySelectorAll('.forecast-day-header')
          .forEach((el, i) => checkOverflow(el, `header dia ${i}`));
        // CORRECCOES-24SET §3 — a célula da onda da lista mobile não pode
        // cortar («1,9 m · 1…» era o bug): todos os spans das linhas.
        root
          .querySelectorAll('.forecast-hourly-row span')
          .forEach((el, i) => checkOverflow(el, `célula da lista ${i}`));
        return out;
      }, SECTION);

      expect(issues, issues.join('\n')).toEqual([]);
    });
  }
});
