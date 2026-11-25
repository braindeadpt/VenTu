import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_BASE_LS_KEY, MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B8 — cabeçalho do site em tokens v6 + atribuição, atrás de `?pele=v6`.
 *  - Com a pele: `header.site-header[data-pele-cabecalho=v6]`, fundo abismo, filete linha,
 *    logótipo em Barlow Condensed, a mesma altura de hoje; atribuição em abismo com
 *    ligações gelo e o mesmo texto (licenças) que sem a pele.
 *  - Sem a pele: nenhum atributo novo e o cabeçalho com os estilos de hoje.
 *  - Sair do /mapa tira a marca do cabeçalho.
 */
// Mosaico 1×1: os tiles do basemap são servidos localmente para o primário
// (CARTO com key, senão Esri) nunca falhar por rede — o fallback Esri não
// dispara a meio do teste e a atribuição fica determinística.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function abre(page: Page, pele: boolean, w = 1440, q = '', pelebase: 'on' | 'off' | 'unset' = 'unset'): Promise<void> {
  await page.setViewportSize({ width: w, height: w > 800 ? 900 : 844 });
  await page.route(/basemaps\.cartocdn\.com|server\.arcgisonline\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }),
  );
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ k, kb, on, base }) => {
      if (on) localStorage.setItem(k, 'v6');
      else localStorage.setItem(k, 'off');
      // #458: a base recolore por defeito com a pele; 'off' é o opt-out gravado.
      if (base === 'off') localStorage.setItem(kb, 'off');
      else localStorage.removeItem(kb);
    },
    { k: MAP_PELE_LS_KEY, kb: MAP_PELE_BASE_LS_KEY, on: pele, base: pelebase },
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
    // Cada preferência abre numa página própria — `abre` regista um init
    // script por chamada e eles acumulam-se entre navegações na mesma página.
    const atr = (p: Page) => p.locator('.leaflet-control-attribution');
    const licencas = (t: string) =>
      t.replace(/\s*©\s*/g, '\n© ').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).sort();
    await abre(page, false);
    await expect(atr(page)).toBeVisible({ timeout: 20_000 });
    await expect(atr(page)).toContainText('OpenStreetMap', { timeout: 20_000 });
    const textoSem = (await atr(page).innerText()).trim();
    // #458: a pele não muda a atribuição — isola-se com pelebase=off (a base
    // recolore por defeito e o texto da base Esri é legitimamente outro).
    // Compara-se o conjunto de licenças, não a string: a ordem dos créditos
    // corre uma race (a camada que regista primeiro aparece primeiro).
    const pPele = await page.context().newPage();
    await abre(pPele, true, 1440, '', 'off');
    await expect(cabecalho(pPele)).toHaveAttribute('data-pele-cabecalho', 'v6', { timeout: 15_000 });
    await expect(atr(pPele)).toBeVisible({ timeout: 20_000 });
    await expect(atr(pPele)).toContainText('OpenStreetMap', { timeout: 20_000 });
    expect(licencas(await atr(pPele).innerText())).toEqual(licencas(textoSem));
    // Com a base por defeito (Esri recolour) as licenças continuam presentes.
    const pBase = await page.context().newPage();
    await abre(pBase, true);
    await expect(atr(pBase)).toBeVisible({ timeout: 20_000 });
    const textoBase = await atr(pBase).innerText();
    expect(textoBase).toContain('Esri');
    expect(textoBase).toContain('Open-Meteo');
    const cor = await atr(pBase).evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      a: el.querySelector('a[href]') ? getComputedStyle(el.querySelector('a[href]')!).color : '',
    }));
    expect(cor.bg).toBe('rgba(3, 14, 24, 0.82)');
    if (cor.a) expect(cor.a).toBe('rgb(127, 231, 255)');
    await pPele.close();
    await pBase.close();
  });

  test('sair do /mapa tira a marca do cabeçalho', async ({ page }) => {
    await abre(page, true);
    await expect(cabecalho(page)).toHaveAttribute('data-pele-cabecalho', 'v6', { timeout: 15_000 });
    await page.locator('header.site-header .site-logo').click();
    await page.waitForURL(/\/pt\/?$/, { timeout: 30_000 });
    await expect(page.locator('[data-pele-cabecalho]')).toHaveCount(0);
  });
});
