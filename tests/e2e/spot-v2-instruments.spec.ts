import { test, expect, type Page } from '@playwright/test';

/**
 * S2B — secção Instrumentos (docs/design/SPOT-PAGE.md §4).
 *
 * A hora escolhida vem do eixo de tempo partilhado. Nesta worktree ainda
 * não existe o slider da régua (é S2A), por isso o spec usa o gancho
 * documentado na secção: CustomEvent «ventu:spot-timeline-set» com o
 * índice — reflectido em data-spot-timeline-index no contentor. Quando a
 * régua existir (S3), o mesmo teste pode passar a usar o slider.
 */

const SECTION = '#instrumentos';
const CARDS = `${SECTION} [data-instrument]`;
const WIND_BEAM = `${CARDS}[data-instrument='wind'] [data-beam]`;

async function setTimelineIndex(page: Page, index: number) {
  await page.evaluate(
    (i) => document.dispatchEvent(new CustomEvent('ventu:spot-timeline-set', { detail: i })),
    index,
  );
  await expect(page.locator(SECTION)).toHaveAttribute('data-spot-timeline-index', String(index));
}

function readouts(page: Page) {
  return page.locator(`${CARDS} [data-role='big']`).allTextContents();
}

test.describe('S2B — Instrumentos (vento, onda, maré)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    // Linhas de forecast carregadas — sem elas os cartões mostram o
    // snapshot «agora» e o scrub não muda valores.
    await expect(page.locator(`${SECTION} > div`)).toHaveAttribute(
      'data-instrument-rows',
      'ready',
      { timeout: 20_000 },
    );
  });

  test('três cartões com leituras e marcação acessível', async ({ page }) => {
    const cards = page.locator(CARDS);
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toHaveAttribute('data-instrument', 'wind');
    await expect(cards.nth(1)).toHaveAttribute('data-instrument', 'wave');
    await expect(cards.nth(2)).toHaveAttribute('data-instrument', 'tide');

    // Botão do cartão controla o painel único (aria-expanded/controls).
    const windBtn = cards.nth(0).getByRole('button');
    await expect(windBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(windBtn).toHaveAttribute('aria-controls', 'instrumentos-detalhe');
  });

  test('mudar a hora altera o feixe do vento e as leituras dos três cartões', async ({
    page,
  }) => {
    const section = page.locator(SECTION);
    const nowIndex = Number(await section.getAttribute('data-spot-timeline-index'));

    const beamBefore = await page.locator(WIND_BEAM).getAttribute('style');
    const readBefore = await readouts(page);

    // Procura uma hora onde os três instrumentos mudam todos (determinístico:
    // percorre as próximas 24 h até encontrar valores distintos).
    let found = -1;
    let readAfter = readBefore;
    let beamAfter = beamBefore;
    for (let step = 3; step <= 24 && found < 0; step += 3) {
      const target = nowIndex + step;
      await setTimelineIndex(page, target);
      readAfter = await readouts(page);
      beamAfter = await page.locator(WIND_BEAM).getAttribute('style');
      const allChanged =
        beamAfter !== beamBefore &&
        readAfter.every((v, i) => v !== readBefore[i]);
      if (allChanged) found = target;
    }

    expect(found, 'nenhuma hora nas próximas 24 h muda os três cartões').toBeGreaterThan(0);
    expect(beamAfter).not.toBe(beamBefore);
    expect(readAfter).not.toEqual(readBefore);
  });

  test('o painel de detalhe abre por teclado e fecha com Escape', async ({ page }) => {
    const waveCard = page.locator(`${CARDS}[data-instrument='wave']`);
    const waveBtn = waveCard.getByRole('button');
    await waveBtn.focus();
    await page.keyboard.press('Enter');

    const panel = page.locator('#instrumentos-detalhe');
    await expect(waveBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-detail', 'wave');

    // O painel mostra conteúdo de onda (feixes de ondulação).
    await expect(panel.getByText(/Feixes de ondulação|Swell trains/i).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(waveBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('maré: a próxima maré do cartão bate com a tábua (fonte canónica)', async ({
    page,
  }) => {
    const tideCard = page.locator(`${CARDS}[data-instrument='tide']`);

    // S2B-fix: a tábua canónica cobre a janela → extremos «ih», não «model».
    await expect(tideCard.locator('svg[data-tide-extrema-source]')).toHaveAttribute(
      'data-tide-extrema-source',
      'ih',
    );

    // Hora da próxima maré no cartão («próxima baixa-mar às HH:MM»).
    const nextLine = await tideCard
      .getByText(/próxima (preia|baixa)-mar às/i)
      .textContent();
    const hhmm = nextLine?.match(/\d{2}:\d{2}/)?.[0];
    expect(hhmm, 'cartão sem «próxima maré»').toBeTruthy();

    // A tábua do painel de detalhe mostra a mesma hora para esse extremo.
    await tideCard.getByRole('button').click();
    const strip = page
      .locator('#instrumentos-detalhe')
      .getByRole('status', { name: /Maré:/i });
    await expect(strip).toBeVisible({ timeout: 20_000 });
    await expect(strip).toContainText(hhmm!);
  });

  test('com prefers-reduced-motion a secção não tem animações a correr', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const running = await page.evaluate(() => {
      const el = document.querySelector('#instrumentos');
      if (!el) return -1;
      return el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running').length;
    });
    expect(running).toBe(0);
  });

  test('EN: cartões traduzidos sem fugas de PT', async ({ page }) => {
    await page.goto('/en/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    const cards = page.locator(CARDS);
    await expect(cards.nth(0)).toContainText('Wind');
    await expect(cards.nth(1)).toContainText('Wave');
    await expect(cards.nth(2)).toContainText('Tide');
    await expect(cards.nth(0)).not.toContainText('Vento');
    await expect(cards.nth(2)).not.toContainText('Maré');
  });
});
