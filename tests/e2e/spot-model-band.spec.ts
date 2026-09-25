import { test, expect, type Page } from '@playwright/test';

/**
 * «Como sabemos» — o detalhe técnico da banda ensemble e do erro por horizonte
 * (regras v3 §8 + auditoria de 25/09, ponto 4: a proveniência não vive nos
 * cartões de instrumentos).
 *
 * O cartão Onda mostra uma frase humana («entre 1,0 e 1,9 m»); é aqui que
 * ficam P10/P50/P90 por família, o número de modelos e o ME/RMSE/n por faixa de
 * horizonte de lead. O spec serve as linhas reais do spot com `ens`
 * determinístico e o forecast-skill.json com `byLead` para a boia do Guincho
 * (IH idEst 1010).
 */
const SECTION = '#como-sabemos';
const BLOCK = `${SECTION} [data-model-band]`;
const WAVE_CARD = "#instrumentos [data-instrument='wave']";
/** Bóia do Guincho no ih-buoys.json (spotMapping.guincho.idEst). */
const BUOY_ID = '19';

async function stubBands(page: Page, withBand: boolean) {
  await page.route('**/data/forecasts/*.json', async (route) => {
    const rows = (await (await route.fetch()).json()) as Record<string, unknown>[];
    const out = rows.map((row, i) => {
      const copy = { ...row };
      delete copy.ens;
      if (!withBand) return copy;
      const h = Number.isFinite(Number(row.waveHeight)) ? Number(row.waveHeight) : 1.5;
      const w = Number.isFinite(Number(row.windSpeed)) ? Number(row.windSpeed) : 7;
      const q = (v: number, d = 2) => Number(v.toFixed(d));
      // Banda constante (independente do índice) para as asserções serem
      // legíveis: P10 = h − 0,4 · P50 = h · P90 = h + 0,5.
      void i;
      return {
        ...copy,
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

async function stubSkill(page: Page, withByLead = true) {
  const buckets = withByLead
    ? [
        { from: 0, to: 12, n: 12, me: 0.1, mae: 0.2, rmse: 0.3, corr: 0.9, meanLeadHours: 6 },
        { from: 24, to: 48, n: 14, me: 0.6, mae: 0.7, rmse: 0.9, corr: 0.6, meanLeadHours: 36 },
      ]
    : undefined;
  await page.route('**/data/forecast-skill.json', (route) =>
    route.fulfill({
      json: {
        fetchedAt: '2026-09-25T06:00:00.000Z',
        pairCount: 40,
        pairCountByOrigin: { ih: 40, 'wmo-pt': 0, 'wmo-es': 0 },
        calibratedPairCount: 0,
        stats: { n: 40, me: 0.3, mae: 0.5, rmse: 0.7, corr: 0.8, meanLeadHours: 20 },
        byOrigin: {
          ih: { n: 40, me: 0.3, mae: 0.5, rmse: 0.7, corr: 0.8, meanLeadHours: 20 },
        },
        byBuoy: {
          [BUOY_ID]: {
            buoyName: 'ZLT1',
            name: 'ZLT1',
            n: 40,
            me: 0.3,
            mae: 0.5,
            rmse: 0.7,
            corr: 0.8,
            meanLeadHours: 20,
            origin: 'ih',
            ...(buckets ? { byLead: buckets } : {}),
          },
        },
      },
    }),
  );
}

async function openSpot(page: Page, path = '/pt/spots/guincho/') {
  const forecast = page.waitForResponse((r) => r.url().includes('/data/forecasts/'));
  await page.goto(path);
  await forecast;
  await expect(
    page.locator(`#instrumentos [data-instrument-rows='ready']`).first(),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe('«Como sabemos» — banda ensemble e erro por horizonte', () => {
  test.use({ serviceWorkers: 'block' });

  test('detalhe técnico: P10/P50/P90 por família + ME/RMSE/n por horizonte', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubBands(page, true);
    await stubSkill(page);
    await openSpot(page);

    const block = page.locator(BLOCK);
    await expect(block).toBeVisible({ timeout: 20_000 });
    await expect(block).toContainText('Banda multi-modelo');
    // As siglas aparecem com o significado por extenso (uma vez).
    await expect(block).toContainText('percentis 10 e 90');

    // Duas famílias, cada uma com os três quantis e a contagem de membros.
    await expect(block).toContainText(/Onda P10 \d,\d · P50 \d,\d · P90 \d,\d m/);
    await expect(block).toContainText(/membros: 4/);
    await expect(block).toContainText(/Vento P10 \d+ · P50 \d+ · P90 \d+ kt/);
    await expect(page.locator(`${BLOCK} [data-band-value]`)).toHaveText([
      /^P10 \d,\d · P50 \d,\d · P90 \d,\d m · membros: 4$/,
      /^P10 \d+ · P50 \d+ · P90 \d+ kt · membros: 4$/,
    ]);

    // Erro por horizonte de lead — só as faixas que o produtor publicou.
    const lead = page.locator(`${BLOCK} [data-skill-by-lead='true']`);
    await expect(lead).toBeVisible({ timeout: 20_000 });
    await expect(lead).toContainText('0–12 h');
    await expect(lead).toContainText('24–48 h');
    await expect(lead).toContainText('n=12');
    await expect(lead).toContainText('n=14');
    await expect(lead).toContainText('RMSE');
    await expect(lead).toContainText('ZLT1');
  });

  test('sem banda na hora, as mesmas duas linhas ficam em «—» e a caixa não muda', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubSkill(page);

    await stubBands(page, true);
    await openSpot(page);
    const withBand = page.locator(BLOCK);
    await expect(withBand).toContainText(/P10 \d,\d/);
    const heightWithBand = (await withBand.boundingBox())!.height;

    // Mesma página, mas o ficheiro do spot sem `ens`: as linhas continuam a
    // existir (com «—») — passar a régua não muda a altura da secção.
    await page.unroute('**/data/forecasts/*.json');
    await stubBands(page, false);
    await openSpot(page);
    const without = page.locator(BLOCK);
    await expect(without).toBeVisible({ timeout: 20_000 });
    // As duas linhas continuam lá — vazias de número, não ausentes.
    await expect(without.locator('[data-band-value]')).toHaveText(['—', '—']);
    await expect(without).not.toContainText('membros:');
    expect(Math.abs((await without.boundingBox())!.height - heightWithBand)).toBeLessThanOrEqual(
      0.5,
    );
  });

  test('sem byLead para a boia, a repartição por horizonte não aparece', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubBands(page, true);
    await stubSkill(page, false);
    await openSpot(page);
    await expect(page.locator(BLOCK)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`${BLOCK} [data-skill-by-lead]`)).toHaveCount(0);
  });

  test('móvel 390px: «Como sabemos» abre e mostra o bloco', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubBands(page, true);
    await stubSkill(page);
    await openSpot(page);

    // No móvel a secção é um <details> fechado (S2C): abre-se pelo summary,
    // o mesmo caminho do utilizador.
    const details = page.locator(`${SECTION} details`);
    await expect(details).not.toHaveAttribute('open', '');
    const summary = details.locator('summary');
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    const block = page.locator(BLOCK);
    await expect(block).toBeVisible({ timeout: 20_000 });
    await expect(block).toContainText(/P10 \d,\d/);

    // Sem overflow horizontal com o bloco aberto.
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });

  test('EN: o bloco sai traduzido e sem jargão no cartão', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubBands(page, true);
    await stubSkill(page);
    await openSpot(page, '/en/spots/guincho/');

    const block = page.locator(BLOCK);
    await expect(block).toBeVisible({ timeout: 20_000 });
    await expect(block).toContainText('Multi-model band');
    await expect(block).toContainText(/Wave P10 \d\.\d · P50 \d\.\d · P90 \d\.\d m/);
    await expect(block).toContainText('members: 4');
    // O cartão continua humano (a sigla vive no detalhe).
    await expect(page.locator(WAVE_CARD)).not.toContainText('P10');
    await expect(page.locator(WAVE_CARD)).toContainText(/between \d\.\d and \d\.\d m/);
  });
});
