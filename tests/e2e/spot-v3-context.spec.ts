import { test, expect, type Page } from '@playwright/test';

/**
 * SP-C — spec v3 §6 «Contexto» (SPOT-UX-V3.md):
 *  - linha A: «No local» 8/12 | «Perto daqui» 4/12
 *  - linha B: «Chegar e estar» a toda a largura, 3 colunas internas,
 *    foto em faixa de 160 px no topo
 *  - linha C: «Como sabemos» a toda a largura (único sítio dos chips
 *    de proveniência — a saída do hero é da SP-A)
 *  - «Perto daqui»: mosaico de score na cor do escalão, nome sem
 *    truncar, distância, link que mantém ?sport=
 *
 * Aceitação medida aqui:
 *  - diferença de altura entre colunas da mesma linha ≤ 20 % da mais alta
 *  - nenhum nome de spot truncado
 *  - nada sobreposto nem cortado a 390 / 768 / 1440
 */

const SPOT_SLUG = 'guincho';

async function openSpot(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/pt/spots/${SPOT_SLUG}/`);
  await expect(
    page.getByRole('heading', { level: 1, name: /Guincho/i }),
  ).toBeVisible({ timeout: 20_000 });
}

/** Alturas dos elementos encontrados; ignora os que não existem. */
async function heights(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els
      .map((el) => el.getBoundingClientRect().height)
      .filter((h) => h > 1),
  );
}

function expectHeightParity(hs: number[], label: string) {
  expect(hs.length, `${label}: esperava ≥2 colunas`).toBeGreaterThanOrEqual(2);
  const max = Math.max(...hs);
  const min = Math.min(...hs);
  expect(
    max - min,
    `${label}: diferença ${max - min}px > 20% de ${max}px`,
  ).toBeLessThanOrEqual(max * 0.2 + 1); // +1 tolerância sub-pixel
}

/** Verifica que nenhum par de caixas se intersecta. */
function expectNoOverlap(
  boxes: { name: string; x: number; y: number; width: number; height: number }[],
) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap =
        a.x < b.x + b.width - 1 &&
        b.x < a.x + a.width - 1 &&
        a.y < b.y + b.height - 1 &&
        b.y < a.y + a.height - 1;
      expect(
        overlap,
        `${a.name} sobrepõe ${b.name} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`,
      ).toBe(false);
    }
  }
}

async function sectionBoxes(page: Page) {
  // Ordem do DOM (mobile): no-local → chegar → perto → como-sabemos.
  // No desktop o reordenamento é só visual (grid placement).
  const names = ['no-local', 'chegar', 'perto', 'como-sabemos'];
  const boxes = [];
  for (const name of names) {
    const box = await page.locator(`#${name}`).boundingBox();
    expect(box, `#${name} sem caixa`).toBeTruthy();
    boxes.push({ name, ...box! });
  }
  return boxes;
}

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits, 'overflow horizontal da página').toBe(true);
}

test.describe('Spot context v3 (SP-C §6)', () => {
  test.use({ serviceWorkers: 'block' });

  test('1440: linha A — «No local» e «Perto daqui» com diferença de altura ≤20%', async ({
    page,
  }) => {
    await openSpot(page, 1440);
    const hs = await heights(page, '#no-local, #perto');
    expectHeightParity(hs, 'linha A');
  });

  test('1440: «Chegar e estar» — faixa de 160 px e 3 colunas internas com diferença ≤20%', async ({
    page,
  }) => {
    await openSpot(page, 1440);

    // Faixa de foto de 160 px no topo do bloco.
    const band = page.locator('#chegar [data-context-band]').first();
    await expect(band).toBeVisible();
    const bandBox = await band.boundingBox();
    expect(Math.abs(bandBox!.height - 160)).toBeLessThanOrEqual(2);

    // Três colunas internas lado a lado na mesma linha.
    const map = await page.locator('[data-context-col="map"]').boundingBox();
    const stay = await page.locator('[data-context-col="stay"]').boundingBox();
    const cond = await page
      .locator('[data-context-col="conditions"]')
      .boundingBox();
    expect(map && stay && cond).toBeTruthy();
    expect(Math.abs(stay!.y - map!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(cond!.y - map!.y)).toBeLessThanOrEqual(2);
    expect(stay!.x).toBeGreaterThan(map!.x);
    expect(cond!.x).toBeGreaterThan(stay!.x);

    // Altura das três colunas dentro de 20 % da mais alta.
    const hs = await heights(
      page,
      '#chegar [data-context-col="map"], #chegar [data-context-col="stay"], #chegar [data-context-col="conditions"]',
    );
    expectHeightParity(hs, 'colunas internas de «Chegar e estar»');
  });

  test('768: duas colunas — «Chegar e estar» a toda a largura por baixo', async ({
    page,
  }) => {
    await openSpot(page, 768);
    const a = await page.locator('#no-local').boundingBox();
    const b = await page.locator('#chegar').boundingBox();
    const c = await page.locator('#perto').boundingBox();
    expect(a && b && c).toBeTruthy();
    expect(Math.abs(c!.y - a!.y)).toBeLessThanOrEqual(2); // mesma linha
    expect(c!.x).toBeGreaterThan(a!.x);
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    expect(b!.width).toBeGreaterThanOrEqual(a!.width + c!.width);
    expectNoOverlap(await sectionBoxes(page));
    await expectNoHorizontalOverflow(page);
  });

  test('390: blocos em accordion empilhados, sem sobreposição nem overflow', async ({
    page,
  }) => {
    await openSpot(page, 390, 844);
    const boxes = await sectionBoxes(page);
    for (let i = 1; i < boxes.length; i++) {
      expect(
        boxes[i].y,
        `${boxes[i].name} devia estar por baixo de ${boxes[i - 1].name}`,
      ).toBeGreaterThan(boxes[i - 1].y);
    }
    expectNoOverlap(boxes);
    await expectNoHorizontalOverflow(page);
  });

  test('1440: sem sobreposição entre os blocos §6/§7', async ({ page }) => {
    await openSpot(page, 1440);
    expectNoOverlap(await sectionBoxes(page));
    await expectNoHorizontalOverflow(page);
  });

  test('«Perto daqui»: nomes sem truncar, distância, ?sport= e mosaico na cor do escalão', async ({
    page,
  }) => {
    await openSpot(page, 1440);
    const list = page.getByTestId('nearby-spots');
    await list.scrollIntoViewIfNeeded();

    const links = list.locator('[data-nearby-spot]');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      // Link mantém a modalidade escolhida.
      await expect(link).toHaveAttribute('href', /\?sport=/);
      // Distância visível na linha secundária (ex.: «· 4,2 km»).
      await expect(link).toContainText(/km|m\b/);
      // Nome nunca truncado: scrollWidth ≤ clientWidth e sem reticências.
      const name = link.locator('[data-nearby-name]');
      const overflow = await name.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow, `nome truncado: ${await name.textContent()}`).toBeLessThanOrEqual(1);
      const ellipsis = await name.evaluate(
        (el) => getComputedStyle(el).textOverflow,
      );
      expect(ellipsis).not.toBe('ellipsis');
    }

    // Mosaico de score: quadrado na cor do escalão quando há score.
    const firstScore = list.locator('[data-nearby-score]').first();
    await expect(firstScore).not.toHaveText('—', { timeout: 15_000 });
    const tier = await firstScore.getAttribute('data-score-tier');
    expect(
      ['epic', 'good', 'fair', 'poor', 'closed'],
      'mosaico sem data-score-tier',
    ).toContain(tier);
    const cls = await firstScore.getAttribute('class');
    expect(cls).toContain(`bg-score-${tier}`);
    expect(cls).toContain(`text-score-${tier}`);
  });

  test('390: nomes de «Perto daqui» sem truncar depois de abrir o accordion', async ({
    page,
  }) => {
    await openSpot(page, 390, 844);
    const perto = page.locator('#perto details');
    await perto.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(perto).toHaveAttribute('open', '');

    const names = perto.locator('[data-nearby-name]');
    const count = await names.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const overflow = await names
        .nth(i)
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test('«Como sabemos» contém os chips de proveniência (único sítio da secção)', async ({
    page,
  }) => {
    await openSpot(page, 1440);
    const hwk = page.locator('#como-sabemos');
    await expect(
      hwk.getByTestId('how-we-know-sources'),
      'bloco de fontes em «Como sabemos»',
    ).toBeAttached();
    // Chips de proveniência presentes dentro de «Como sabemos»
    // (eixos garantidos: wave, wind, confidence — o de frescura só
    // existe quando conditions.source vem preenchido).
    for (const axis of ['wave', 'wind', 'confidence']) {
      await expect(
        hwk.locator(`[data-provenance-axis="${axis}"]`).first(),
        `chip de proveniência «${axis}»`,
      ).toBeAttached();
    }
  });
});
