import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B8 — cabeçalho do site em tokens v6 + atribuição, atrás de `?pele=v6`.
 *  - Com a pele: `header.site-header[data-pele-cabecalho=v6]`, fundo abismo, filete linha,
 *    logótipo em Barlow Condensed, a mesma altura de hoje; atribuição em abismo com
 *    ligações gelo e o mesmo texto (licenças) que sem a pele.
 *  - Sem a pele: nenhum atributo novo e o cabeçalho com os estilos de hoje.
 *  - Sair do /mapa tira a marca do cabeçalho.
 */
async function abre(page: Page, pele: boolean, w = 1440, q = ''): Promise<void> {
  await page.setViewportSize({ width: w, height: w > 800 ? 900 : 844 });
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ k, on }) => {
      if (on) localStorage.setItem(k, 'v6');
      else localStorage.setItem(k, 'off');
    },
    { k: MAP_PELE_LS_KEY, on: pele },
  );
  await page.goto(`/pt/mapa/?sport=surf${q}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

const cabecalho = (page: Page) => page.locator('header.site-header');

test.describe('/mapa pele v6 — cabeçalho e atribuição (B8)', () => {
  test('sem a pele: cabeçalho de hoje, sem atributo', async ({ page }) => {
    await abre(page, false);
    await expect(cabecalho(page)).not.toHaveAttribute('data-pele-cabecalho', /.*/);
    await expect(page.locator('[data-pele-cabecalho]')).toHaveCount(0);
  });

  for (const w of [1440, 390]) {
    test(`com a pele a ${w}: tokens v6, mesma altura`, async ({ page }) => {
      await abre(page, false, w);
      const hSem = (await cabecalho(page).boundingBox())!.height;
      await abre(page, true, w);
      const h = cabecalho(page);
      await expect(h).toHaveAttribute('data-pele-cabecalho', 'v6', { timeout: 15_000 });
      expect((await h.boundingBox())!.height).toBe(hSem);
      const est = await h.evaluate((el) => {
        const cs = getComputedStyle(el);
        const logo = el.querySelector('.site-logo-txt');
        return { bg: cs.backgroundColor, bb: cs.borderBottomColor, logo: logo ? getComputedStyle(logo).fontFamily : '' };
      });
      expect(est.bg).toBe('rgba(3, 14, 24, 0.92)');
      expect(est.bb).toBe('rgb(30, 67, 97)');
      expect(est.logo).toContain('Barlow Condensed');
    });
  }

  test('atribuição v6 com o mesmo texto de licenças', async ({ page }) => {
    await abre(page, false);
    const atr = page.locator('.leaflet-control-attribution');
    await expect(atr).toBeVisible({ timeout: 20_000 });
    const textoSem = (await atr.innerText()).trim();
    await abre(page, true);
    await expect(cabecalho(page)).toHaveAttribute('data-pele-cabecalho', 'v6', { timeout: 15_000 });
    await expect(atr).toBeVisible({ timeout: 20_000 });
    expect((await atr.innerText()).trim()).toBe(textoSem);
    const cor = await atr.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      a: el.querySelector('a[href]') ? getComputedStyle(el.querySelector('a[href]')!).color : '',
    }));
    expect(cor.bg).toBe('rgba(3, 14, 24, 0.82)');
    if (cor.a) expect(cor.a).toBe('rgb(127, 231, 255)');
  });

  test('sair do /mapa tira a marca do cabeçalho', async ({ page }) => {
    await abre(page, true);
    await expect(cabecalho(page)).toHaveAttribute('data-pele-cabecalho', 'v6', { timeout: 15_000 });
    await page.locator('header.site-header .site-logo').click();
    await page.waitForURL(/\/pt\/?$/, { timeout: 30_000 });
    await expect(page.locator('[data-pele-cabecalho]')).toHaveCount(0);
  });
});
