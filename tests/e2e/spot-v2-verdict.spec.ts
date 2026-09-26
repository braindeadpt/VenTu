import { test, expect, type Page } from '@playwright/test';

/**
 * S2A — Veredicto + barra fixa única + régua de 48 h (docs/design/SPOT-PAGE.md
 * §0–3). Cobre o eixo de tempo partilhado: arrastar/teclar na régua muda o
 * score no veredicto E na barra; «Agora» repõe a hora actual; reduced-motion
 * desliga o count-up; o menu «Mais» é operável por teclado; e a régua não
 * cria overflow horizontal em 390 px.
 */

const SPOT_URL = '/pt/spots/guincho/';
const BAR_LABEL = 'Modalidade e hora escolhida';

async function openSpot(page: Page) {
  await page.goto(SPOT_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: /Guincho/i }),
  ).toBeVisible({ timeout: 20_000 });
  // A régua só aparece quando o eixo tem horas (previsão carregada).
  await expect(page.getByRole('slider')).toBeVisible({ timeout: 20_000 });
  // React montado (HydrationBeacon) + aterragem em «agora» concluída —
  // antes disso os handlers de ponteiro/teclado ainda não respondem.
  await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
  await page.waitForSelector('[role="slider"] rect[fill="var(--verdict)"]', {
    timeout: 20_000,
  });
}

const slider = (page: Page) => page.getByRole('slider');
const meter = (page: Page) => page.locator('#agora').getByRole('meter');

/** Score mostrado no pill da barra fixa (testid explícito — os tabs também têm mini-scores).
 *  CORRECCOES-24SET §1: a barra está sempre visível (getByRole resolve), mas
 *  o chip score+hora é um extra — só entra quando o hero sai do ecrã, por
 *  isso faz-se scroll até a régua ficar pinned antes de ler. */
async function barScore(page: Page): Promise<number> {
  await page.evaluate(() => window.scrollTo(0, 1600));
  const region = page.getByRole('region', { name: BAR_LABEL });
  await expect(region).toBeVisible();
  const txt = await region.getByTestId('spot-bar-score').textContent();
  return Number(txt);
}

test.describe('S2A — régua de 48 h comanda veredicto e barra', () => {
  test.use({ serviceWorkers: 'block' });

  test('arrastar a régua muda o score do veredicto e da barra', async ({ page }) => {
    await openSpot(page);

    const before = await meter(page).getAttribute('aria-valuenow');
    const track = await slider(page).boundingBox();
    expect(track).not.toBeNull();

    // Arrasta para ~85% da régua — ~41 h à frente na janela de 48 h.
    await page.mouse.move(track!.x + track!.width * 0.5, track!.y + track!.height / 2);
    await page.mouse.down();
    await page.mouse.move(track!.x + track!.width * 0.85, track!.y + track!.height / 2, {
      steps: 8,
    });
    await page.mouse.up();

    // O slider reflecte a nova posição local (0..n-1).
    const nowAttr = await slider(page).getAttribute('aria-valuenow');
    expect(Number(nowAttr)).toBeGreaterThan(30);

    // Veredicto (meter) e barra convergem para o score DA HORA ARRASTADA —
    // lido do aria-valuetext da régua («…: score N, TIER»). Não se assume
    // que difere de `before`: a hora alvo pode ter o mesmo score.
    const vt = (await slider(page).getAttribute('aria-valuetext')) ?? '';
    const m = vt.match(/score\s+(\d+)/i);
    const targetScore = m ? Number(m[1]) : Number.NaN;
    if (Number.isFinite(targetScore)) {
      await expect
        .poll(async () => Number(await meter(page).getAttribute('aria-valuenow')))
        .toBe(targetScore);
    } else {
      await expect
        .poll(async () => Number(await meter(page).getAttribute('aria-valuenow')))
        .not.toBe(Number(before));
    }
    const verdictScore = Number(await meter(page).getAttribute('aria-valuenow'));
    await expect.poll(async () => barScore(page)).toBe(verdictScore);
  });

  test('teclado: setas ±1 h, Home/End aos limites da janela', async ({ page }) => {
    await openSpot(page);
    const rail = slider(page);
    await rail.focus();

    const max = Number(await rail.getAttribute('aria-valuemax'));
    expect(max).toBeGreaterThan(0);

    await rail.press('End');
    expect(await rail.getAttribute('aria-valuenow')).toBe(String(max));

    await rail.press('Home');
    expect(await rail.getAttribute('aria-valuenow')).toBe('0');

    await rail.press('ArrowRight');
    expect(await rail.getAttribute('aria-valuenow')).toBe('1');

    await rail.press('PageDown');
    expect(await rail.getAttribute('aria-valuenow')).toBe('7');

    await rail.press('PageUp');
    expect(await rail.getAttribute('aria-valuenow')).toBe('1');

    await rail.press('ArrowLeft');
    expect(await rail.getAttribute('aria-valuenow')).toBe('0');
    // Clamp no início da janela — não sai para índices anteriores a «agora».
    await rail.press('ArrowLeft');
    expect(await rail.getAttribute('aria-valuenow')).toBe('0');
  });

  test('«Agora» repõe a hora actual no eixo', async ({ page }) => {
    await openSpot(page);
    const rail = slider(page);
    await rail.focus();
    await rail.press('End');

    const agora = page.getByRole('button', { name: 'Agora', exact: true });
    await expect(agora).toBeVisible();
    await agora.click();

    // De volta ao início da janela (a hora actual é o índice 0 local) e o
    // rótulo volta a «Agora» — o botão desaparece porque já não há deriva.
    expect(await rail.getAttribute('aria-valuenow')).toBe('0');
    await expect(agora).toBeHidden();
    await expect(
      page.locator('#agora').getByText('Agora', { exact: true }),
    ).toBeVisible();
  });

  test('a barra escolhida herda --verdict da raiz da secção (nunca preto)', async ({ page }) => {
    await openSpot(page);

    // fill computado da barra escolhida vs. cor do score do hero — a mesma
    // variável --verdict definida UMA vez na raiz da secção (S2A-fix #1).
    const probe = () =>
      page.evaluate(() => {
        const rail = document.querySelector('[role="slider"]');
        const selBar = rail?.querySelector('rect[fill="var(--verdict)"]');
        const meterEl = document.querySelector('#agora [role="meter"]');
        return {
          barFill: selBar ? getComputedStyle(selBar).fill : null,
          scoreColor: meterEl ? getComputedStyle(meterEl).color : null,
        };
      });

    // Aterragem em «agora» é pós-mount — espera a barra seleccionada existir.
    // O fill computado inclui o alfa do fill-opacity (rgba) — comparam-se os
    // canais RGB, ignorando o alfa.
    const rgb = (c: string | null) => c?.match(/\d+/g)?.slice(0, 3).join(',') ?? null;
    await expect.poll(async () => (await probe()).barFill).not.toBeNull();
    let g = await probe();
    expect(rgb(g.barFill)).not.toBe('0,0,0');
    expect(rgb(g.barFill)).toBe(rgb(g.scoreColor));

    // Seta → outra hora: as duas superfícies convergem para a nova cor —
    // o fill da barra transiciona 200 ms, por isso espera-se a igualdade.
    const rail = slider(page);
    await rail.focus();
    await rail.press('ArrowRight');
    await expect
      .poll(async () => rgb((await probe()).barFill))
      .not.toBe('0,0,0');
    await expect
      .poll(async () => rgb((await probe()).barFill))
      .toBe(rgb((await probe()).scoreColor));
  });

  test('aria-valuetext descreve hora, score e banda', async ({ page }) => {
    await openSpot(page);
    const vt = await slider(page).getAttribute('aria-valuetext');
    // Ex.: «qui 17 set, 12:00: score 93, ÉPICO»
    // `\p{L}` (e não `\w`) de propósito: as abreviaturas do dia e do mês
    // levam acento em pt («sáb», «dom», «fev», «mar») e `\w` é [A-Za-z0-9_] —
    // aos fins de semana este teste ficava vermelho sem nada ter mudado.
    expect(vt).toMatch(/\p{L}{3} \d{1,2} \p{L}{3}, \d{2}:\d{2}: score \d{1,3}, (ÉPICO|BOM|FUN|FLAT|FECHADO)/u);
  });

  test('menu «Mais»: abre por teclado, Esc fecha e devolve o foco', async ({ page }) => {
    await openSpot(page);
    const trigger = page
      .locator('#agora')
      .getByRole('button', { name: 'Mais', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // O menu tem o Partilhar e o Check-in.
    const menu = page.locator('#agora [role="group"][aria-label="Mais acções"]');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('mobile 390 px: a régua não cria overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSpot(page);
    await page.evaluate(() => window.scrollTo(0, 900));
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });
});

test.describe('S2A — reduced motion', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('o score muda directo, sem count-up intermédio', async ({ page }) => {
    await openSpot(page);
    const rail = slider(page);
    await rail.focus();

    const before = await meter(page).getAttribute('aria-valuenow');
    await rail.press('End');

    // Sem animação: o texto visível é já o valor final (== aria-valuenow).
    const now = await meter(page).getAttribute('aria-valuenow');
    expect(now).not.toBe(before);
    const shown = await meter(page).textContent();
    expect(Number(shown)).toBe(Number(now));
  });
});
