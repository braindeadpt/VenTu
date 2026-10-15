import { test, expect } from '@playwright/test';
import { readRealForecasts } from './helpers/conditions';
import { SPOT_URL, meter, notaDoValueText, openSpotV6 as openSpot, reguaHora, slider } from './helpers/spotV6';

/**
 * S2A → v6 (#184) — veredicto + régua de 48 h no eixo de tempo partilhado.
 * Portado do herói/barra antigos para a página v6 «Atlântico»: arrastar e
 * teclar na régua muda a nota do veredicto e a barra da hora escolhida; Home
 * repõe «Agora»; previsão expirada não finge ser «agora»; reduced-motion
 * troca a nota sem count-up; o menu «Mais» (linha de acções) é operável por
 * teclado; a régua não cria overflow horizontal a 390 px.
 */

test.describe('S2A — régua de 48 h comanda o veredicto', () => {
  test.use({ serviceWorkers: 'block' });

  test('previsão expirada não apresenta uma hora passada como Agora', async ({ page }) => {
    const rows = readRealForecasts().guincho;
    const last = String(rows[rows.length - 1].time);
    await page.clock.setFixedTime(new Date(new Date(`${last}Z`).getTime() + 24 * 3_600_000));
    await page.goto(SPOT_URL);
    const hero = page.locator('#agora');
    await expect(hero.getByText('Sem previsão para agora', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(hero.getByText('Agora', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('spot-quando')).not.toContainText(/agora/i);
    await expect(reguaHora(page)).not.toContainText(/Agora/);
    await expect(page.getByRole('button', { name: 'Agora', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('spot-v6')).toHaveAttribute('data-sem-agora', '');
    // As horas antigas continuam datadas e navegáveis — 48 h, não uma hora
    // «actual» solitária.
    await expect(slider(page)).toHaveAttribute('aria-valuemax', '47');
  });

  test('arrastar a régua muda a nota do veredicto e a barra escolhida', async ({ page }) => {
    await openSpot(page);
    const before = await meter(page).getAttribute('aria-valuenow');
    const track = await slider(page).boundingBox();
    expect(track).not.toBeNull();

    // Arrasta para ~85% da régua — ~41 h à frente na janela de 48 h.
    await page.mouse.move(track!.x + track!.width * 0.5, track!.y + track!.height / 2);
    await page.mouse.down();
    await page.mouse.move(track!.x + track!.width * 0.85, track!.y + track!.height / 2, { steps: 8 });
    await page.mouse.up();

    const nowAttr = Number(await slider(page).getAttribute('aria-valuenow'));
    expect(nowAttr).toBeGreaterThan(30);

    // O veredicto converge para a nota DA HORA ARRASTADA, lida do
    // aria-valuetext da régua («…, N em 10»). Sem nota (noite) a hora muda na
    // mesma e o veredicto passa à lua.
    const vt = await slider(page).getAttribute('aria-valuetext');
    const alvo = notaDoValueText(vt);
    if (Number.isFinite(alvo)) {
      await expect.poll(async () => Number(await meter(page).getAttribute('aria-valuenow'))).toBe(alvo);
    } else {
      await expect(page.locator('#agora [role="img"].nota')).toBeVisible();
      expect(before).not.toBeNull();
    }
    // A barra da hora escolhida tem a banda do veredicto.
    const bandas = await page.evaluate((i) => {
      const bar = document.querySelectorAll('[data-testid="regua-48h"] .faixa i')[i] as HTMLElement | undefined;
      const v = document.querySelector('[data-testid="spot-veredicto"]') as HTMLElement | null;
      return { regua: bar?.dataset.banda, hero: v?.dataset.banda };
    }, nowAttr);
    expect(bandas.regua).toBeTruthy();
    expect(bandas.regua).toBe(bandas.hero);
  });

  test('teclado: setas ±1 h, PageUp/PageDown ±6 h, Home/End aos limites da janela', async ({ page }) => {
    await openSpot(page);
    const rail = slider(page);
    await rail.focus();

    const max = Number(await rail.getAttribute('aria-valuemax'));
    expect(max).toBe(47);

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

  test('Home repõe a hora actual e o rótulo «Agora»', async ({ page }) => {
    await openSpot(page);
    const rail = slider(page);
    await expect(reguaHora(page)).toContainText(/^Agora · /);
    await expect(page.getByTestId('spot-quando')).toContainText(/· agora$/);

    await rail.focus();
    await rail.press('End');
    await expect(reguaHora(page)).not.toContainText('Agora');
    await expect(page.getByTestId('spot-quando')).not.toContainText(/agora/);

    await rail.press('Home');
    expect(await rail.getAttribute('aria-valuenow')).toBe('0');
    await expect(reguaHora(page)).toContainText(/^Agora · /);
    await expect(page.getByTestId('spot-quando')).toContainText(/· agora$/);
  });

  test('a barra escolhida tem a cor da nota do veredicto (nunca preto)', async ({ page }) => {
    await openSpot(page);
    const probe = () =>
      page.evaluate(() => {
        const s = document.querySelector('[role="slider"]');
        const i = Number(s?.getAttribute('aria-valuenow'));
        const bar = document.querySelectorAll('[data-testid="regua-48h"] .faixa i')[i];
        const nota = document.querySelector('#agora .nota');
        return {
          barFill: bar ? getComputedStyle(bar).backgroundColor : null,
          notaFill: nota ? getComputedStyle(nota).backgroundColor : null,
        };
      });
    const rgb = (c: string | null) => c?.match(/\d+/g)?.slice(0, 3).join(',') ?? null;
    await expect.poll(async () => {
      const g = await probe();
      return rgb(g.barFill) === rgb(g.notaFill) && rgb(g.barFill) !== '0,0,0';
    }).toBe(true);

    // Outra hora: as duas superfícies convergem para a nova cor.
    const rail = slider(page);
    await rail.focus();
    await rail.press('ArrowRight');
    await expect.poll(async () => {
      const g = await probe();
      return rgb(g.barFill) === rgb(g.notaFill) && rgb(g.barFill) !== '0,0,0';
    }).toBe(true);
  });

  test('aria-valuetext descreve dia, hora, banda e nota /10', async ({ page }) => {
    await openSpot(page);
    const vt = await slider(page).getAttribute('aria-valuetext');
    // Ex.: «qua 14, 14h: Bom, 7 em 10». \p{L} e não \w: o \w do JS não apanha
    // letras acentuadas e «sáb» falhava todos os sábados.
    expect(vt).toMatch(/^\p{L}{3} \d{1,2}, \d{1,2}h: (Muito bom|Bom|Dá|Fraco|Não dá)(, \d{1,2} em 10)?$|^\p{L}{3} \d{1,2}, \d{1,2}h: Noite$/u);
    expect(vt).not.toMatch(/\/100|\b(1[1-9]|[2-9]\d) em 10/);
  });

  test('menu «Mais»: abre por teclado, Esc fecha e devolve o foco', async ({ page }) => {
    await openSpot(page);
    const trigger = page.getByTestId('spot-acoes').getByRole('button', { name: 'Mais', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const menu = page.locator('[data-testid="spot-acoes"] [role="group"][aria-label="Mais acções"]');
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
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  });
});

test.describe('S2A — reduced motion', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('a nota muda directo, sem count-up intermédio', async ({ page }) => {
    await openSpot(page);
    const rail = slider(page);
    await rail.focus();
    await rail.press('End');
    const alvo = notaDoValueText(await rail.getAttribute('aria-valuetext'));
    // Sem animação: o texto visível é já o valor final (== aria-valuenow == régua).
    const now = await meter(page).getAttribute('aria-valuenow');
    if (Number.isFinite(alvo)) expect(Number(now)).toBe(alvo);
    const shown = (await meter(page).textContent())?.replace('/10', '').trim();
    expect(Number(shown)).toBe(Number(now));
  });
});
