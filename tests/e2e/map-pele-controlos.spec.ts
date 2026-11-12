import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B5 — pilha de controlos, menu Camadas e legenda na pele v6.
 * Com a pele: o popover (portalizado) leva data-pele, os itens e a ordem são os de
 * sempre, o interruptor ligado fica em sol e a legenda mostra as cinco bandas e a
 * noite. Sem a pele: nem um `data-mc` no documento.
 */

async function abre(page: Page, on: boolean): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ key, on }) => {
      if (on) localStorage.setItem(key, 'v6');
      else localStorage.removeItem(key);
      localStorage.setItem('ventu.map.cluster', '0');
    },
    { key: MAP_PELE_LS_KEY, on },
  );
  await page.goto('/pt/mapa/?sport=surf&lat=38.73&lon=-9.47&z=10', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await expect(page.locator('[data-map-control-stack]')).toBeVisible({ timeout: 20_000 });
}

const nomesDasCamadas = async (page: Page) =>
  page.locator('[data-map-layers-popover] button[aria-pressed]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );

test.describe('/mapa pele v6 — pilha, Camadas e legenda (B5), desktop', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('os mesmos itens das Camadas, na mesma ordem, com e sem a pele', async ({ page, browser }) => {
    await abre(page, false);
    await page.locator('[data-map-control-stack] [data-map-layers-menu]').click();
    await expect(page.locator('[data-map-layers-popover]')).toBeVisible();
    const sem = await nomesDasCamadas(page);
    expect(await page.locator('[data-mc]').count()).toBe(0);
    await expect(page.locator('[data-map-layers-popover]')).not.toHaveAttribute('data-pele', /.*/);

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p2 = await ctx.newPage();
    await abre(p2, true);
    await p2.locator('[data-map-control-stack] [data-map-layers-menu]').click();
    const pop = p2.locator('[data-map-layers-popover]');
    await expect(pop).toHaveAttribute('data-pele', 'v6');
    expect(await nomesDasCamadas(p2)).toEqual(sem);
    await expect(pop.locator('[data-mc="base"] [role="radio"]')).toHaveCount(2);
    await ctx.close();
  });

  test('interruptor ligado em sol; legenda com as cinco bandas e a noite', async ({ page }) => {
    await abre(page, true);
    const legenda = page.locator('[data-map-legend-card]');
    await expect(legenda).toBeVisible();
    await expect(legenda.locator('[data-mc="bandas"] > li')).toHaveCount(5);
    await expect(legenda.locator('[data-mc="leg-noite"]')).toContainText('Noite');

    await page.locator('[data-map-control-stack] [data-map-layers-menu]').click();
    const linha = page.locator('[data-map-layers-popover] button[aria-pressed]').first();
    if ((await linha.getAttribute('aria-pressed')) !== 'true') await linha.click();
    await expect(linha).toHaveAttribute('aria-pressed', 'true');
    const fundo = await linha.locator('[data-mc="sw"]').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(fundo).toBe('rgb(255, 201, 60)');
  });
});
