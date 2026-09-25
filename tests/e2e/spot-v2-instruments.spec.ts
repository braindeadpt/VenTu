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
 * Banda ensemble no cartão Onda — o SLOT secundário e a altura do cartão.
 *
 * O `ens` só existe nas horas multi-modelo e o ficheiro servido em dev/CI é de
 * um run best_match (sem a chave): o spec serve as linhas REAIS do spot com
 * `ens` derivado do valor da hora, para o alinhamento com a régua de 48 h (e o
 * resto da página) ficar intacto. `serviceWorkers: 'block'` é obrigatório — o
 * SW do build serve os /data/* da cache e passa à frente das rotas.
 *
 * O que aqui se prova é a correcção da auditoria de 25/09: a banda entra na
 * linha que o cartão JÁ tem (três linhas sempre, nunca quatro) e a altura do
 * cartão e da secção é a mesma com e sem banda — a página não salta ao mexer
 * na régua nem entre o HTML de partida e o relógio vivo.
 */
test.describe('S2B — banda ensemble no cartão Onda (uma linha, sempre)', () => {
  test.use({ serviceWorkers: 'block' });

  const SPOT = 'guincho';
  const WAVE_CARD = `${CARDS}[data-instrument='wave']`;
  const BAND = `${WAVE_CARD} [data-wave-band='card']`;
  /** Filhos directos do miolo de leitura: big + 2 linhas secundárias. */
  const WAVE_LINES = `${WAVE_CARD} button > span.grid > span`;
  const WAVE_SLOT = `${WAVE_LINES}:nth-child(3)`;
  const PT_TEXT = /^entre \d,\d e \d,\d m$/;
  const PT_HINT = '8 em cada 10 modelos ficam neste intervalo';

  type BandMode = 'all' | 'even' | 'none';

  /**
   * Serve as linhas do spot com `ens` derivado de cada hora.
   * 'even' deixa metade das horas sem banda — é assim que o spec compara uma
   * hora com banda com uma hora sem banda na MESMA página.
   */
  async function stubBands(
    page: Page,
    mode: BandMode,
    opts: { delayMs?: number; dropSwell?: boolean } = {},
  ) {
    const { delayMs = 0, dropSwell = false } = opts;
    await page.route('**/data/forecasts/*.json', async (route) => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const rows = (await (await route.fetch()).json()) as Record<string, unknown>[];
      const out = rows.map((row, i) => {
        const copy = { ...row };
        delete copy.ens;
        if (dropSwell) {
          delete copy.swellHeight;
          delete copy.swellPeriod;
        }
        const withBand = mode === 'all' || (mode === 'even' && i % 2 === 0);
        if (!withBand) return copy;
        const h = Number.isFinite(Number(row.waveHeight)) ? Number(row.waveHeight) : 1.5;
        const w = Number.isFinite(Number(row.windSpeed)) ? Number(row.windSpeed) : 7;
        const q = (v: number, d = 2) => Number(v.toFixed(d));
        return {
          ...copy,
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
      await route.fulfill({ json: out });
    });
  }

  /** Abre o spot e espera (por omissão) pelas linhas horárias do forecast. */
  async function openSpot(page: Page, path = `/pt/spots/${SPOT}/`) {
    const forecast = page.waitForResponse((r) => r.url().includes('/data/forecasts/'));
    await page.goto(path);
    await forecast;
    await expect(
      page.locator(`${SECTION} [data-instrument-rows='ready']`).first(),
    ).toBeVisible({ timeout: 20_000 });
  }

  const height = async (page: Page, selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    return box?.height ?? -1;
  };

  test('a banda entra na linha que já existia, sem siglas e com tooltip', async ({ page }) => {
    await stubBands(page, 'all');
    await openSpot(page);

    // Três linhas, sempre as mesmas: big + 2 secundárias. Uma linha A MAIS
    // (a regressão do f2508ce66) falha aqui.
    await expect(page.locator(WAVE_LINES)).toHaveCount(3);

    const band = page.locator(BAND);
    await expect(band).toBeVisible({ timeout: 15_000 });
    // Uma frase humana, sem siglas — e a explicação no title/leitor de ecrã.
    await expect(page.locator(`${BAND} > span`).first()).toHaveText(PT_TEXT);
    await expect(band).toHaveAttribute('title', PT_HINT);
    await expect(band).toContainText(PT_HINT);

    // Regra 2 da auditoria: nada de jargão no cartão.
    const card = page.locator(WAVE_CARD);
    await expect(card).not.toContainText('P10');
    await expect(card).not.toContainText('RMSE');
  });

  test('EN: a banda sai traduzida e com a vírgula decimal local', async ({ page }) => {
    await stubBands(page, 'all');
    await openSpot(page, `/en/spots/${SPOT}/`);
    const band = page.locator(BAND);
    await expect(band).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`${BAND} > span`).first()).toHaveText(
      /^between \d\.\d and \d\.\d m$/,
    );
    await expect(page.locator(WAVE_CARD)).not.toContainText('P10');
  });

  test('sem banda na hora o slot volta ao mar de fundo (e continua com 3 linhas)', async ({ page }) => {
    await stubBands(page, 'none');
    await openSpot(page);

    await expect(page.locator(BAND)).toHaveCount(0);
    await expect(page.locator(WAVE_LINES)).toHaveCount(3);
    await expect(page.locator(WAVE_CARD)).not.toContainText('P10');
  });

  test('degradação: sem banda e sem mar de fundo o slot fica vazio com a mesma altura', async ({
    page,
  }) => {
    // Sem banda e sem mar de fundo o slot fica com o placeholder NBSP —
    // invisível, mas com a caixa (é o que impede o salto ao mudar de hora).
    await stubBands(page, 'none', { dropSwell: true });
    await openSpot(page);
    const emptySlot = await height(page, WAVE_SLOT);
    const emptyCard = await height(page, WAVE_CARD);
    // A caixa do slot vazio: com o placeholder NBSP o span tem uma caixa de
    // linha inteira; com um espaço normal colapsava e media 0 (ou nada).
    expect(emptySlot).toBeGreaterThan(10);
    // E o placeholder é mesmo NBSP (U+00A0) — textContent não normaliza.
    const placeholder = await page.locator(`${WAVE_SLOT} > span`).first().textContent();
    expect(placeholder).toBe('\u00a0');

    await page.unroute('**/data/forecasts/*.json');
    await stubBands(page, 'all');
    await openSpot(page);
    await expect(page.locator(BAND)).toBeVisible();
    expect(Math.abs((await height(page, WAVE_SLOT)) - emptySlot)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((await height(page, WAVE_CARD)) - emptyCard)).toBeLessThanOrEqual(0.5);
  });

  test('mesma altura com e sem banda — cartão e secção, a 390 e 1350 px', async ({ page }) => {
    for (const width of [390, 1350]) {
      await page.setViewportSize({ width, height: 900 });
      await stubBands(page, 'even');
      await openSpot(page);
      const nowIndex = Number(
        await page.locator(SECTION).getAttribute('data-spot-timeline-index'),
      );

      let withBand: { card: number; section: number } | null = null;
      let without: { card: number; section: number } | null = null;
      for (let step = 0; step <= 12 && !(withBand && without); step += 1) {
        if (step > 0) await setTimelineIndex(page, nowIndex + step);
        const hasBand = (await page.locator(BAND).count()) > 0;
        if (hasBand && !withBand) {
          withBand = { card: await height(page, WAVE_CARD), section: await height(page, SECTION) };
        } else if (!hasBand && !without) {
          without = { card: await height(page, WAVE_CARD), section: await height(page, SECTION) };
        }
      }

      expect(withBand, `sem hora com banda a ${width}px`).not.toBeNull();
      expect(without, `sem hora sem banda a ${width}px`).not.toBeNull();
      expect(Math.abs(withBand!.card - without!.card), `cartão a ${width}px`).toBeLessThanOrEqual(
        0.5,
      );
      expect(
        Math.abs(withBand!.section - without!.section),
        `secção a ${width}px`,
      ).toBeLessThanOrEqual(0.5);

      await page.unroute('**/data/forecasts/*.json');
    }
  });

  test('o slot não muda de altura entre o HTML de partida e as linhas do forecast', async ({
    page,
  }) => {
    // 2,5 s de atraso no ficheiro do spot: dá para medir o estado de arranque
    // (snapshot `conditions`, sem banda) e o estado com linhas (com banda) na
    // mesma página — é o intervalo que a auditoria dizia saltar.
    await stubBands(page, 'all', { delayMs: 2500 });
    const forecast = page.waitForResponse((r) => r.url().includes('/data/forecasts/'));
    await page.goto(`/pt/spots/${SPOT}/`);
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    const container = page.locator(`${SECTION} > div`).first();
    await expect(container).toHaveAttribute('data-instrument-rows', 'loading');
    const before = await height(page, WAVE_CARD);
    expect(await page.locator(WAVE_LINES).count()).toBe(3);

    await forecast;
    await expect(container).toHaveAttribute('data-instrument-rows', 'ready', {
      timeout: 20_000,
    });
    await expect(page.locator(BAND)).toBeVisible({ timeout: 15_000 });
    expect(
      Math.abs((await height(page, WAVE_CARD)) - before),
      'altura do cartão entre o arranque e as linhas',
    ).toBeLessThanOrEqual(0.5);
  });
});
