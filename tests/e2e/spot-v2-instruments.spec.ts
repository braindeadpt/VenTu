import { test, expect, type Page } from '@playwright/test';

/**
 * S2B — secção Instrumentos (docs/design/SPOT-PAGE.md §4).
 *
 * A hora escolhida vem do eixo de tempo partilhado. O spec move-a pelo
 * slider da régua (S3 — o gancho CustomEvent saiu do código de produção);
 * a mudança reflecte-se em data-spot-timeline-index no contentor.
 */

const SECTION = '#instrumentos';
const CARDS = `${SECTION} [data-instrument]`;
const WIND_BEAM = `${CARDS}[data-instrument='wind'] [data-beam]`;

async function setTimelineIndex(page: Page, index: number) {
  // O mesmo caminho do utilizador: clique na régua — o track mapeia a
  // fracção horizontal → índice global dentro da janela de 48 h.
  const slider = page.getByRole('slider');
  const max = Number(await slider.getAttribute('aria-valuemax'));
  const localNow = Number(await slider.getAttribute('aria-valuenow'));
  const globalNow = Number(
    await page.locator(SECTION).getAttribute('data-spot-timeline-index'),
  );
  const local = index - (globalNow - localNow);
  const box = await slider.boundingBox();
  if (!box || !Number.isFinite(max) || local < 0 || local > max) {
    throw new Error(`índice ${index} fora da janela visível da régua`);
  }
  await slider.click({
    position: { x: ((local + 0.5) / (max + 1)) * box.width, y: box.height / 2 },
  });
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

  test('chip do vento usa classifyWind — 4 categorias do score (UX v3 §4)', async ({
    page,
  }) => {
    const windCard = page.locator(`${CARDS}[data-instrument='wind']`);
    const chip = windCard.locator('button .rounded-full');
    // Um dos quatro rótulos canónicos — a mesma classificação do score
    // (onshore / side-onshore / side-offshore / offshore).
    await expect(chip).toHaveText(/^(Onshore|Cross-on|Cross-off|Offshore)$/);
  });

  test('abrir o cartão anima o painel por grid-template-rows (240 ms)', async ({
    page,
  }) => {
    const windCard = page.locator(`${CARDS}[data-instrument='wind']`);
    const acc = page.locator(`${SECTION} .ventu-inst-acc`);

    // Fechado: 0fr. Aberto: 1fr — transição declarada na classe.
    await expect(acc).toHaveCSS('grid-template-rows', '0px');
    await windCard.getByRole('button').click();
    await expect(acc).toHaveAttribute('data-open', '');
    await expect(acc).toHaveCSS('transition-duration', '0.24s');

    // A borda do cartão aberto usa --verdict a 40% — mas a cor interpola
    // durante a transição de 240 ms: espera o valor final. Chromium pode
    // serializar como color(srgb … / 0.4) ou oklab(… / 0.4).
    await expect
      .poll(async () =>
        windCard.evaluate((el) => getComputedStyle(el).borderColor),
      )
      .toMatch(/[,/]\s*0\.4\s*\)$/);
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

    // A tábua canónica cobre a janela → extremos «schedule» (a série do
    // modelo alinhada pela tábua), não «model» (parábola).
    await expect(tideCard.locator('svg[data-tide-extrema-source]')).toHaveAttribute(
      'data-tide-extrema-source',
      'schedule',
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

/**
 * Banda ensemble P10/P50/P90 (campo `ens` da linha horária) + skill por
 * horizonte de lead (`byLead` do forecast-skill.json).
 *
 * O `ens` só existe nas horas multi-modelo — e o ficheiro servido em dev/CI é
 * de um run best_match, sem a chave. Por isso o spec serve as linhas REAIS do
 * spot com `ens` acrescentado (mantém o alinhamento com a régua de 48 h e o
 * resto da página intacto) e stubba o forecast-skill.json com um byLead
 * determinístico para a boia mapeada do Guincho (IH idEst 1010).
 */
test.describe('S2B — banda ensemble P10–P90 + skill por horizonte (lead)', () => {
  // O SW do build estático serve os JSON de dados da cache — sem o bloquear,
  // as rotas do Playwright não interceptam o ficheiro do spot.
  test.use({ serviceWorkers: 'block' });

  const SPOT = 'guincho';
  const BUOY_ID = '1010';
  const WAVE_CARD = `${CARDS}[data-instrument='wave']`;
  const PANEL = '#instrumentos-detalhe';

  /** Serve as linhas do spot com uma banda determinística derivada do valor. */
  async function stubForecastBand(page: Page, withBand = true) {
    await page.route('**/data/forecasts/*.json', async (route) => {
      const rows = (await (await route.fetch()).json()) as Record<string, unknown>[];
      const banded = rows.map((r) => {
        if (!withBand) {
          const copy = { ...r };
          delete copy.ens;
          return copy;
        }
        const h = Number.isFinite(Number(r.waveHeight)) ? Number(r.waveHeight) : 1.5;
        const w = Number.isFinite(Number(r.windSpeed)) ? Number(r.windSpeed) : 7;
        const q = (v: number, d = 2) => Number(v.toFixed(d));
        return {
          ...r,
          // [waveP10, waveP50, waveP90, windP10, windP50, windP90, waveN, windN]
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
      await route.fulfill({ json: banded });
    });
  }

  async function stubSkillByLead(page: Page, byLead = true) {
    const buckets = byLead
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
          byOrigin: { ih: { n: 40, me: 0.3, mae: 0.5, rmse: 0.7, corr: 0.8, meanLeadHours: 20 } },
          byBuoy: {
            [BUOY_ID]: {
              buoyName: 'ZLT1',
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

  /**
   * Abre o spot e espera que as linhas horárias cheguem. Espera pela RESPOSTA
   * do ficheiro do spot e depois pelo marcador `ready` (seletor de atributo +
   * `.first()` — durante a hidratação o shell pode desenhar duas cópias do
   * contentor e `#instrumentos > div` batia em strict mode).
   */
  async function openSpot(page: Page) {
    const forecast = page.waitForResponse((r) => r.url().includes('/data/forecasts/'));
    await page.goto(`/pt/spots/${SPOT}/`);
    await forecast;
    await expect(page.locator(`${SECTION} [data-instrument-rows="ready"]`).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  test('cartão Onda mostra a banda P10–P90 da hora (e nada sem `ens`)', async ({ page }) => {
    await stubForecastBand(page, false);
    await openSpot(page);
    // Sem `ens` na linha, o cartão não inventa banda.
    await expect(page.locator(WAVE_CARD).locator('[data-wave-band="card"]')).toHaveCount(0);
  });

  test('cartão Onda: banda P10–P90 visível com os membros do ensemble', async ({ page }) => {
    await stubForecastBand(page);
    await openSpot(page);
    const band = page.locator(WAVE_CARD).locator('[data-wave-band="card"]');
    await expect(band).toBeVisible({ timeout: 15_000 });
    await expect(band).toContainText('P10–P90');
    await expect(band).toContainText('4 modelos');
    // Formatação PT: vírgula decimal (o número grande do cartão usa a mesma).
    await expect(band).toContainText(/\d,\d–\d,\d m/);
  });

  test('detalhe da Onda: banda da hora + skill por horizonte de lead', async ({ page }) => {
    await stubForecastBand(page);
    await stubSkillByLead(page);
    await openSpot(page);
    await page.locator(WAVE_CARD).getByRole('button').click();
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Banda da hora escolhida: onda em m (P10/P50/P90) e vento em kt.
    const detailBand = panel.locator('[data-wave-band="detail"]');
    await expect(detailBand).toBeVisible();
    await expect(detailBand).toContainText('Onda');
    await expect(detailBand).toContainText('P10');
    await expect(detailBand).toContainText('P50');
    await expect(detailBand).toContainText('P90');
    await expect(detailBand).toContainText('kt');
    // Onda em metros com 2 casas e vírgula PT; vento convertido para kt inteiro.
    await expect(detailBand).toContainText(/P10 \d,\d\d · P50 \d,\d\d · P90 \d,\d\d m/);
    await expect(detailBand).toContainText(/P10 \d+ · P50 \d+ · P90 \d+ kt/);

    // Skill por horizonte: só as faixas que o produtor publicou, com ME/RMSE/n.
    const lead = panel.locator('[data-skill-by-lead="true"]');
    await expect(lead).toBeVisible({ timeout: 20_000 });
    await expect(lead).toContainText('0–12 h');
    await expect(lead).toContainText('24–48 h');
    await expect(lead).toContainText('n=12');
    await expect(lead).toContainText('n=14');
    await expect(lead).toContainText('RMSE');
  });

  test('skill por horizonte: sem byLead para a boia, a repartição não aparece', async ({
    page,
  }) => {
    await stubForecastBand(page);
    await stubSkillByLead(page, false);
    await openSpot(page);
    await page.locator(WAVE_CARD).getByRole('button').click();
    await expect(page.locator(PANEL)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`${PANEL} [data-skill-by-lead]`)).toHaveCount(0);
  });
});
