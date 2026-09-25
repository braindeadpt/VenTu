import { test, expect, type Page } from '@playwright/test';

/**
 * A banda ensemble na régua de 48 h (§3) e no badge de confiança do spot (§7)
 * — o passo que a nota «Ainda não há UI» do CONTEXT.md deixou em aberto.
 *
 * As duas superfícies obedecem à mesma disciplina do cartão Onda (auditoria de
 * 25/09):
 *  - **caixa fixa**: a faixa e a linha da régua desenham-se SEMPRE (placeholder
 *    NBSP quando a hora não tem banda) e o intervalo entra no DETALHE do badge,
 *    nunca no rótulo — o chip tem de manter a largura, senão a ProvenanceRow
 *    reflui e a secção mexe sem nada ter mudado para o leitor;
 *  - **sem siglas**: a régua diz «Ondas entre 1,0 e 1,9 m» e o badge
 *    «8 em cada 10 modelos ficam neste intervalo» — P10/P50/P90, membros e
 *    ME/RMSE por horizonte ficam em «Como sabemos» (regra v3 §8).
 *
 * O `ens` é stubado com uma banda constante (P10 = onda − 0,4 m, P90 = onda +
 * 0,5 m, 4 membros) para as asserções serem legíveis; sem stub, os dados
 * publicados hoje não trazem `ens` e é exactamente esse o estado sem banda que
 * o segundo load mede. A linha é lida com a casa decimal fixa (`f1`, o mesmo
 * formatador dos cartões): «Ondas entre 1,0 e 1,9 m», nunca «1 e 1,9».
 */

const SECTION = '#quando';
const STRIP = `${SECTION} [data-rail-band="strip"]`;
const LINE = `${SECTION} [data-rail-band="line"]`;
const BADGE = '#como-sabemos [data-provenance-axis="confidence"]';

/** Banda constante por hora: P10 = h − 0,4 · P90 = h + 0,5 · 4 membros. */
async function stubBands(page: Page, withBand: boolean): Promise<void> {
  await page.route('**/data/forecasts/*.json', async (route) => {
    const rows = (await (await route.fetch()).json()) as Record<string, unknown>[];
    const q = (v: number, d = 2) => Number(v.toFixed(d));
    await route.fulfill({
      json: rows.map((row) => {
        const copy = { ...row };
        delete copy.ens;
        if (!withBand) return copy;
        const h = Number.isFinite(Number(row.waveHeight)) ? Number(row.waveHeight) : 1.5;
        const w = Number.isFinite(Number(row.windSpeed)) ? Number(row.windSpeed) : 7;
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
      }),
    });
  });
}

interface RailGeom {
  sectionH: number;
  headerH: number;
  stripH: number;
  lineH: number;
  marks: number;
  lineText: string;
}

const railGeom = (): RailGeom => {
  const section = document.querySelector('#quando') as HTMLElement;
  const strip = document.querySelector('#quando [data-rail-band="strip"]') as HTMLElement;
  const line = document.querySelector('#quando [data-rail-band="line"]') as HTMLElement;
  const h = (el: Element) => Math.round(el.getBoundingClientRect().height * 10) / 10;
  return {
    sectionH: h(section),
    // Linha do título + botões: é aqui que o botão «Agora» (caixa reservada)
    // entrava e saía e mudava a altura da secção ao arrastar.
    headerH: h(section.firstElementChild as Element),
    stripH: h(strip),
    lineH: h(line),
    marks: strip.querySelectorAll('rect').length,
    // Só o span VISÍVEL (o `sr-only` com a cobertura vem depois, e o texto do
    // placeholder é um NBSP que um `trim` esconderia).
    lineText: line.querySelector('span')?.textContent ?? '',
  };
};

async function openSpot(page: Page, locale = 'pt'): Promise<void> {
  await page.goto(`/${locale}/spots/guincho/`);
  await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
  await expect(page.getByRole('slider')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(900);
}

test.describe('banda ensemble na régua de 48 h e no badge de confiança', () => {
  test.use({ serviceWorkers: 'block' });

  for (const vp of [
    { name: '320', width: 320, height: 844 },
    { name: '390', width: 390, height: 844 },
    { name: '1350', width: 1350, height: 900 },
  ] as const) {
    test(`@ ${vp.name}px — a faixa aparece e a régua não muda de altura`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await stubBands(page, true);
      await openSpot(page);

      // A linha em palavras só existe com banda (o fetch das linhas é
      // pós-mount) — espera-se pelo texto, não por um atraso fixo.
      await expect(page.locator(LINE)).toContainText(/Ondas entre \d{1,2},\d e \d{1,2},\d m/);
      const withBand = await page.evaluate(railGeom);
      expect(withBand.marks).toBeGreaterThanOrEqual(40); // ~48 h, 1 por hora
      expect(withBand.stripH).toBe(18);

      // Arrastar a régua não muda a caixa de nada: só o texto.
      const rail = page.getByRole('slider');
      await rail.focus();
      await rail.press('Home');
      await page.waitForTimeout(200);
      const texts = new Set<string>();
      for (let i = 0; i < 8; i++) {
        const g = await page.evaluate(railGeom);
        expect(g.sectionH).toBe(withBand.sectionH);
        expect(g.headerH).toBe(withBand.headerH);
        expect(g.stripH).toBe(withBand.stripH);
        expect(g.lineH).toBe(withBand.lineH);
        expect(g.marks).toBe(withBand.marks);
        texts.add(g.lineText);
        await rail.press('ArrowRight');
        await rail.press('ArrowRight');
        await rail.press('ArrowRight');
        await page.waitForTimeout(90);
      }
      expect(texts.size).toBeGreaterThan(1); // o texto segue a hora escolhida
      // `\d{1,2}` de propósito: uma P10 de dois dígitos (temporal) não pode
      // fazer o teste vermelho — o que se mede é a caixa, não o valor do mar.
      expect([...texts].every((t) => /^Ondas entre \d{1,2},\d e \d{1,2},\d m$/.test(t))).toBe(true);

      // Sem `ens` (o estado dos dados publicados hoje): a faixa esvazia-se e a
      // linha fica com o placeholder NBSP — na MESMA caixa.
      const page2 = await page.context().newPage();
      await page2.setViewportSize({ width: vp.width, height: vp.height });
      await stubBands(page2, false);
      await openSpot(page2);
      const bare = await page2.evaluate(railGeom);
      expect(bare.marks).toBe(0);
      expect(bare.sectionH).toBe(withBand.sectionH);
      expect(bare.stripH).toBe(withBand.stripH);
      expect(bare.lineH).toBe(withBand.lineH);
      // NBSP a sério: um espaço normal colapsa no JSX e a linha perdia altura.
      expect(await page2.locator(`${LINE} span`).first().textContent()).toBe('\u00A0');
      await page2.close();
    });
  }

  // A frase vem do dicionário e o NÚMERO tem de seguir o idioma. Apanha duas
  // regressões de uma vez: o rótulo em inglês numa página alemã e o ponto
  // decimal («1.4 m») onde o idioma escreve vírgula — o formatador local era
  // `isPt ? 'pt-PT' : 'en-GB'`, por isso es/de/fr liam «1.4 m».
  for (const [loc, re] of [
    ['en', /Waves between \d\.\d and \d\.\d m/],
    ['es', /Olas entre \d,\d y \d,\d m/],
    ['de', /Wellen zwischen \d,\d und \d,\d m/],
    ['fr', /Vagues entre \d,\d et \d,\d m/],
  ] as const) {
    test(`a régua fala ${loc} com a mesma frase e o mesmo intervalo`, async ({ page }) => {
      test.setTimeout(120_000);
      await stubBands(page, true);
      await openSpot(page, loc);
      await expect(page.locator(LINE)).toContainText(re);
    });
  }

  test('o badge de confiança leva o intervalo sem mudar de largura', async ({ page }) => {
    test.setTimeout(120_000);
    await stubBands(page, true);
    await openSpot(page);

    const badge = page.locator(BADGE).first();
    await badge.scrollIntoViewIfNeeded();
    await expect(badge).toBeVisible();
    // O intervalo entra no detalhe (title + popover), nunca no rótulo.
    await expect(badge).toHaveAttribute('title', /8 em cada 10 modelos ficam neste intervalo/);
    await expect(badge).toHaveAttribute('title', /Ondas entre \d,\d e \d,\d m/);
    const withBand = await badge.evaluate((el) => ({
      w: Math.round(el.getBoundingClientRect().width * 10) / 10,
      label: (el.textContent ?? '').trim(),
    }));

    // O rótulo é o tier da confiança — a banda não lhe toca (nem números).
    expect(withBand.label).not.toMatch(/Ondas|\d/);

    const page2 = await page.context().newPage();
    await stubBands(page2, false);
    await openSpot(page2);
    const badge2 = page2.locator(BADGE).first();
    await badge2.scrollIntoViewIfNeeded();
    await expect(badge2).toBeVisible();
    const bare = await badge2.evaluate((el) => ({
      w: Math.round(el.getBoundingClientRect().width * 10) / 10,
      title: el.getAttribute('title') ?? '',
    }));
    expect(bare.title).not.toMatch(/Ondas entre/);
    expect(Math.abs(bare.w - withBand.w)).toBeLessThanOrEqual(1);
    await page2.close();
  });
});
