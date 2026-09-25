import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Menu «Camadas» usável por teclado — padrão menu-button WAI-ARIA com
 * toggles multi-selecção. O popover é portalizado para document.body
 * (hit-test Leaflet), portanto toda a gestão de foco é explícita:
 * Enter abre no primeiro item, setas roving, Tab/Shift+Tab sai e fecha,
 * Escape devolve o foco ao trigger sem sair do ecrã inteiro.
 */

async function openMapa(page: Page): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

const trigger = (page: Page) =>
  page.locator('[data-map-controls] [data-map-layers-menu]').first();
const popover = (page: Page) => page.locator('[data-map-layers-popover]');
const items = (page: Page) =>
  popover(page).locator('button:not([disabled])');

test.describe('Menu Camadas — teclado (desktop)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });

  test('Enter abre, foca o primeiro item e expõe aria-* do menu-button', async ({ page }) => {
    await openMapa(page);
    const trig = trigger(page);
    await expect(trig).toBeVisible({ timeout: 30_000 });
    await expect(trig).toHaveAttribute('aria-haspopup', 'true');

    await trig.focus();
    await page.keyboard.press('Enter');

    const pop = popover(page);
    await expect(pop).toBeVisible({ timeout: 10_000 });
    await expect(trig).toHaveAttribute('aria-expanded', 'true');
    // aria-controls aponta para o popover portalizado
    const controlsId = await trig.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(await pop.getAttribute('id')).toBe(controlsId);

    await expect(items(page).first()).toBeFocused();
  });

  test('setas percorrem com wrap e Home/End saltam', async ({ page }) => {
    await openMapa(page);
    await trigger(page).press('Enter');
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });

    const count = await items(page).count();
    expect(count).toBeGreaterThan(2);

    await page.keyboard.press('ArrowDown');
    await expect(items(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp'); // volta ao primeiro
    await expect(items(page).first()).toBeFocused();
    await page.keyboard.press('ArrowUp'); // wrap → último
    await expect(items(page).nth(count - 1)).toBeFocused();
    await page.keyboard.press('ArrowDown'); // wrap → primeiro
    await expect(items(page).first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(items(page).nth(count - 1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items(page).first()).toBeFocused();
  });

  test('Espaço liga a camada e o menu fica aberto', async ({ page }) => {
    await openMapa(page);
    await trigger(page).press('Enter');
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });

    // M5 (§8): os primeiros focáveis são os rádios Mapa/Satélite da secção
    // «Base» — para o toggle multi-selecção usa-se a primeira linha com
    // aria-pressed (uma camada de dados).
    const first = popover(page).locator('button[aria-pressed]:not([disabled])').first();
    await first.focus();
    const wasPressed = (await first.getAttribute('aria-pressed')) === 'true';
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-pressed', String(!wasPressed));
    await expect(popover(page)).toBeVisible(); // multi-selecção: não fecha
  });

  test('Escape fecha e devolve o foco ao trigger sem sair do ecrã inteiro', async ({ page }) => {
    await openMapa(page);
    const trig = trigger(page);
    await trig.press('Enter');
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });
    await items(page).first().focus();

    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await expect(trig).toBeFocused();
    // O Escape não pode ter saído do modo mapa — a barra de controlos e o
    // shell do mapa continuam montados e não houve navegação.
    await expect(page.locator('[data-map-controls]')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(page.url()).toContain('/pt/mapa/');
  });

  test('Tab fecha e segue para o próximo focável; Shift+Tab recua', async ({ page }) => {
    await openMapa(page);
    const trig = trigger(page);
    await trig.press('Enter');
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });
    await items(page).first().focus();

    // Tab — sai do popover, foco retoma depois do trigger.
    await page.keyboard.press('Tab');
    await expect(popover(page)).toHaveCount(0);
    const afterTab = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        inPopover: !!el?.closest?.('[data-map-layers-popover]'),
        isTrigger: el?.hasAttribute('data-map-layers-menu') ?? false,
        tag: el?.tagName ?? '',
      };
    });
    expect(afterTab.inPopover).toBe(false);
    expect(afterTab.isTrigger).toBe(false);
    expect(afterTab.tag).not.toBe('BODY');

    // Reabrir e Shift+Tab — foco recua para o focável antes do trigger.
    await trig.press('Enter');
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });
    await items(page).first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(popover(page)).toHaveCount(0);
    const afterShift = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        inPopover: !!el?.closest?.('[data-map-layers-popover]'),
        tag: el?.tagName ?? '',
      };
    });
    expect(afterShift.inPopover).toBe(false);
    expect(afterShift.tag).not.toBe('BODY');
  });
});

test.describe('Menu Camadas — teclado (mobile 390)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
  });

  // No fullscreen mobile o MapControls (e o menu pill) não renderizam —
  // as camadas vivem na grelha «Camadas» do sheet, botões nativos na ordem
  // de Tab. O contrato teclável equivalente: focáveis via Tab e toggláveis
  // com Enter/Space, com aria-pressed.
  test('toggles de camadas do sheet são operáveis por teclado', async ({ page }) => {
    await openMapa(page);
    await page.locator('[data-sheet-grabber]').click(); // peek → half
    const group = page
      .locator('[data-explore-sheet]')
      .getByRole('group', { name: 'Camadas' })
      .first();
    await expect(group).toBeVisible({ timeout: 20_000 });

    const toggles = group.locator('button:not([disabled])');
    expect(await toggles.count()).toBeGreaterThan(1);

    const first = toggles.first();
    await first.focus();
    await expect(first).toBeFocused();
    const wasPressed = (await first.getAttribute('aria-pressed')) === 'true';
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-pressed', String(!wasPressed));

    // Tab avança na ordem natural do DOM para o toggle seguinte.
    await page.keyboard.press('Tab');
    await expect(toggles.nth(1)).toBeFocused();
    const secondWasPressed =
      (await toggles.nth(1).getAttribute('aria-pressed')) === 'true';
    await page.keyboard.press('Enter');
    await expect(toggles.nth(1)).toHaveAttribute(
      'aria-pressed',
      String(!secondWasPressed),
    );
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });
});
