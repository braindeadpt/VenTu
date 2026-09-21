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
}

const slider = (page: Page) => page.getByRole('slider');
const meter = (page: Page) => page.locator('#agora').getByRole('meter');
const bar = (page: Page) => page.getByRole('region', { name: BAR_LABEL });

/** Score mostrado no pill da barra fixa (testid explícito — os tabs também têm mini-scores). */
async function barScore(page: Page): Promise<number> {
  const region = bar(page);
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

    // Veredicto (meter) e barra convergem para o mesmo score da hora escolhida.
    await expect
      .poll(async () => Number(await meter(page).getAttribute('aria-valuenow')))
      .not.toBe(Number(before));
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

  test('aria-valuetext descreve hora, score e banda', async ({ page }) => {
    await openSpot(page);
    const vt = await slider(page).getAttribute('aria-valuetext');
    // Ex.: «qui 17 set, 12:00: score 93, ÉPICO»
    expect(vt).toMatch(/\w{3} \d{1,2} \w{3}, \d{2}:\d{2}: score \d{1,3}, (ÉPICO|BOM|FUN|FLAT|FECHADO)/);
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
