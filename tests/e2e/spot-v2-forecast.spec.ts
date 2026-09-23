import { test, expect, type Page } from '@playwright/test';
import { SPORT_LABELS } from '../../src/lib/sportRatings';

/**
 * S3/SP-B — «Hora a hora» sincronizada com o eixo de tempo partilhado.
 *
 * Duas direcções (docs/design/SPOT-PAGE.md §5, SPOT-UX-V3 §5):
 *  1. Régua → previsão: a coluna da hora escolhida ganha data-tl-selected
 *     (matiz --verdict 12% + contorno --verdict) na tabela e na lista
 *     mobile.
 *  2. Previsão → eixo: clicar numa coluna (desktop) ou numa linha de hora
 *     (mobile) muda o índice — régua e instrumentos reflectem a mesma hora.
 *
 * O destaque é imperativo (ForecastTimelineSync): a ForecastTable não
 * re-renderiza por passo — medido por window.__ventuFtRenders.
 *
 * O meteograma saiu da página (UX v3 — «um painel, um eixo»): não há
 * data-tl-meteogram nem data-tl-stripe.
 */

const SECTION = '#previsao';
const INSTRUMENTS = '#instrumentos';

/** Índice global da timeline — verdade lida nos instrumentos. */
async function globalIndex(page: Page): Promise<number> {
  return Number(
    await page.locator(INSTRUMENTS).getAttribute('data-spot-timeline-index'),
  );
}

/** Move a hora pelo slider da régua — o mesmo caminho do utilizador. */
async function setTimelineIndex(page: Page, index: number) {
  const slider = page.getByRole('slider');
  const max = Number(await slider.getAttribute('aria-valuemax'));
  const localNow = Number(await slider.getAttribute('aria-valuenow'));
  const offset = (await globalIndex(page)) - localNow;
  const local = index - offset;
  const box = await slider.boundingBox();
  if (!box || !Number.isFinite(max) || local < 0 || local > max) {
    throw new Error(`índice ${index} fora da janela visível da régua`);
  }
  await slider.click({
    position: { x: ((local + 0.5) / (max + 1)) * box.width, y: box.height / 2 },
  });
  await expect(page.locator(INSTRUMENTS)).toHaveAttribute(
    'data-spot-timeline-index',
    String(index),
  );
}

test.describe('S3/SP-B — «Hora a hora» no eixo de tempo partilhado', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });
    // Secção hidratada e marcada pelo sync.
    await expect(page.locator(SECTION)).toHaveAttribute(
      'data-spot-timeline-index',
      /\d+/,
      { timeout: 20_000 },
    );
  });

  test('título «Hora a hora» e sem meteograma na página', async ({ page }) => {
    await expect(
      page.locator(`${SECTION} h2`, { hasText: 'Hora a hora' }),
    ).toBeVisible();
    // O meteograma foi removido — nenhum resíduo do eixo concorrente.
    await expect(page.locator(`${SECTION} [data-tl-meteogram]`)).toHaveCount(0);
    await expect(page.locator(`${SECTION} [data-tl-stripe]`)).toHaveCount(0);
  });

  test('régua → previsão: coluna destacada em todas as linhas', async ({
    page,
  }) => {
    const target = (await globalIndex(page)) + 6;
    await setTimelineIndex(page, target);

    await expect(page.locator(SECTION)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );

    // Coluna destacada em todas as linhas renderizadas (header + dados).
    const selected = page.locator(
      `${SECTION} [data-tl-col="${target}"][data-tl-selected]`,
    );
    expect(await selected.count()).toBeGreaterThanOrEqual(4);
  });

  test('tabela → eixo: clicar numa coluna muda a hora em toda a página', async ({
    page,
  }) => {
    const now = await globalIndex(page);
    const slider = page.getByRole('slider');
    const localNow = Number(await slider.getAttribute('aria-valuenow'));
    const offset = now - localNow;
    const target = now + 9;

    // Célula de dados da coluna (não o header) — caminho real do clique.
    const cell = page
      .locator(`${SECTION} td[data-tl-col="${target}"]`)
      .first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Eixo reflecte a nova hora nas secções instrumentadas.
    await expect(page.locator(INSTRUMENTS)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );
    await expect(page.locator(SECTION)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );
    // Régua: o slider aponta para a mesma hora (local = global - offset).
    await expect(slider).toHaveAttribute(
      'aria-valuenow',
      String(target - offset),
    );
    // E a coluna clicada ficou destacada.
    await expect(
      page.locator(`${SECTION} td[data-tl-col="${target}"]`).first(),
    ).toHaveAttribute('data-tl-selected', '');
  });

  test('arrasto de 10 passos na régua não re-renderiza a ForecastTable', async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __ventuFtRenders?: number }).__ventuFtRenders = 0;
    });

    const start = await globalIndex(page);

    // 10 passos pelo track (cliques sucessivos = drag discreto).
    for (let s = 1; s <= 10; s++) {
      await setTimelineIndex(page, start + s);
    }
    expect(await globalIndex(page)).toBe(start + 10);

    const renders = await page.evaluate(
      () => (window as unknown as { __ventuFtRenders?: number }).__ventuFtRenders ?? -1,
    );
    // A tabela não consome o índice — zero renders por passo.
    expect(renders).toBe(0);
  });

  test('desktop: ordem das linhas e separadores de dia', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Ordem da spec §5: Score, Ondas, Período, Vento, Rajada, Direcção,
    // Maré, Água.
    const labels = await page
      .locator(`${SECTION} .forecast-table-scroll tbody th[scope='row']`)
      .allTextContents();
    const clean = labels.map((l) => l.replace(/\s+/g, ' ').trim());
    // A linha de score usa o rótulo da modalidade («Surf», «Bodyboard»…)
    // ou «Score» como fallback — o que a spec fixa é que é a 1.ª linha.
    const sportNames = Object.values(SPORT_LABELS).map((s) => s.pt);
    expect(
      sportNames.includes(clean[0]) || clean[0].startsWith('Score'),
      `1.ª linha devia ser o score (${sportNames.join('/')}/Score), é «${clean[0]}»`,
    ).toBe(true);
    const order = ['Ondas', 'Período', 'Vento', 'Rajada', 'Direcção', 'Maré', 'Água'];
    const positions = order.map((label) =>
      clean.findIndex((l) => l.startsWith(label)),
    );
    expect(
      positions.every((p) => p >= 0),
      `linhas da tabela: ${clean.join(' | ')}`,
    ).toBe(true);
    expect(
      positions.every((p, i) => i === 0 || p > positions[i - 1]),
      'ordem das linhas não respeita a spec',
    ).toBe(true);

    // Separador de dia: a primeira coluna de cada novo dia civil tem a
    // classe forecast-col-daystart — pelo menos uma além da primeira.
    const daySeps = await page
      .locator(`${SECTION} .forecast-table-scroll .forecast-col-daystart`)
      .count();
    expect(daySeps).toBeGreaterThan(8); // ≥1 novo dia × ≥8 linhas + header
  });

  test('desktop: chips de dia saltam para o dia certo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Chips de dia (pills por cima da tabela) — 48 h cobrem ≥3 dias civis.
    const allChips = page.locator(`${SECTION} .rounded-pill`);
    expect(await allChips.count()).toBeGreaterThanOrEqual(2);

    const scroller = page.locator(`${SECTION} .forecast-table-scroll`);
    const before = await scroller.evaluate((el) => el.scrollLeft);
    await allChips.nth(1).click();
    await expect
      .poll(async () => scroller.evaluate((el) => el.scrollLeft))
      .not.toBe(before);
  });
});
