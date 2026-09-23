import { test, expect, type Page } from '@playwright/test';

/**
 * S3 — previsão sincronizada com o eixo de tempo partilhado.
 *
 * Duas direcções (docs/design/SPOT-PAGE.md §5):
 *  1. Régua → previsão: a coluna da hora escolhida ganha data-tl-selected
 *     (matiz --verdict + contorno) e o stripe do meteograma move-se.
 *  2. Previsão → eixo: clicar numa coluna da tabela ou no meteograma muda
 *     o índice — régua e instrumentos reflectem a mesma hora.
 *
 * O destaque é imperativo (ForecastTimelineSync): a ForecastTable não
 * re-renderiza por passo — medido por window.__ventuFtRenders.
 */

const SECTION = '#previsao';
const INSTRUMENTS = '#instrumentos';
const METEOGRAM = `${SECTION} [data-tl-meteogram]`;

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

test.describe('S3 — previsão no eixo de tempo partilhado', () => {
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

  test('régua → previsão: coluna destacada e stripe do meteograma', async ({
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

    // Stripe do meteograma activa e posicionada na coluna escolhida.
    const stripe = page.locator(`${SECTION} [data-tl-stripe]`);
    await expect(stripe).toHaveCSS('opacity', '1');
    expect(await stripe.evaluate((el) => el.style.transform)).toBe(
      `translateX(${target * 15}px)`,
    );
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

  test('meteograma → eixo: clicar numa coluna escolhe a hora', async ({
    page,
  }) => {
    const mg = page.locator(METEOGRAM);
    const box = await mg.boundingBox();
    test.skip(!box, 'meteograma fora do viewport');
    const target = (await globalIndex(page)) + 4;

    // Posição x = centro da coluna (largura fixa de 15 px).
    const x = (target + 0.5) * 15;
    test.skip(x > box!.width, 'coluna fora da área visível do meteograma');
    await mg.click({ position: { x, y: 20 } });

    await expect(page.locator(INSTRUMENTS)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );
    await expect(page.locator(SECTION)).toHaveAttribute(
      'data-spot-timeline-index',
      String(target),
    );
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
});
