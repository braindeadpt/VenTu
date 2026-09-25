import { test, expect, type Page } from '@playwright/test';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';

/**
 * Créditos do controlo de atribuição do Leaflet — auditoria do mapa.
 *
 * Cada camada regista o seu crédito via opção `attribution` (basemap,
 * EMODnet, OpenSeaMap, radar) ou add/removeAttribution (IH), e o Leaflet
 * gere add/remove por contagem de referências. Regressão coberta aqui: um
 * efeito antigo regravava `attributionControl._attributions` a cada troca
 * de basemap/tema, o que apagava os créditos EMODnet/OpenSeaMap/radar
 * registados pelas camadas e deixava «OpenStreetMap contributors» duplicado.
 *
 * Spec hermética — os tiles WMS/raster são servidos como pixel PNG.
 */
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const attribution = (page: Page) => page.locator('.leaflet-control-attribution');

async function openMapa(page: Page) {
  await preseedWindRingLegend(page);
  await page.route('**/ows.emodnet-bathymetry.eu/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_PIXEL });
  });
  await page.route('**/tiles.openseamap.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_PIXEL });
  });
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map attribution (Leaflet control)', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('créditos EMODnet/OpenSeaMap aparecem com camadas ligadas via localStorage', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.bathymetry', '1');
      localStorage.setItem('ventu.map.seamarks', '1');
    });
    await openMapa(page);

    await expect(attribution(page)).toContainText('EMODnet', { timeout: 15_000 });
    await expect(attribution(page)).toContainText('OpenSeaMap');
  });

  test('ligar as camadas pelo menu «Camadas» junta os créditos', async ({ page }) => {
    await openMapa(page);

    await expect(attribution(page)).not.toContainText('EMODnet');
    await expect(attribution(page)).not.toContainText('OpenSeaMap');

    await openMapLayersMenu(page);
    const bathymetryToggle = page.locator('[data-map-bathymetry-toggle]').first();
    await expect(bathymetryToggle).toBeAttached({ timeout: 20_000 });
    await bathymetryToggle.dispatchEvent('click');
    await expect(attribution(page)).toContainText('EMODnet', { timeout: 15_000 });

    const seamarksToggle = page.locator('[data-map-seamarks-toggle]').first();
    await expect(seamarksToggle).toBeAttached({ timeout: 20_000 });
    await seamarksToggle.dispatchEvent('click');
    await expect(attribution(page)).toContainText('OpenSeaMap', { timeout: 15_000 });
  });

  test('créditos das camadas sobrevivem ao satélite e à troca de tema', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.bathymetry', '1');
      localStorage.setItem('ventu.map.seamarks', '1');
    });
    await openMapa(page);

    await expect(attribution(page)).toContainText('EMODnet', { timeout: 15_000 });
    await expect(attribution(page)).toContainText('OpenSeaMap');

    // Troca de basemap — antes apagava os créditos registados pelas camadas.
    // (M5: o rádio vive dentro do menu «Camadas» → abrir primeiro.)
    await openMapLayersMenu(page);
    await page.getByRole('radio', { name: 'Satélite' }).click();
    await expect(attribution(page)).toContainText(/Esri/, { timeout: 15_000 });
    await expect(attribution(page)).toContainText('EMODnet');
    await expect(attribution(page)).toContainText('OpenSeaMap');

    // Troca de tema (dark ↔ light) — re-anexa o basemap; os overlays ficam.
    await page.evaluate(() => document.documentElement.classList.toggle('theme-ocean'));
    await expect(attribution(page)).toContainText('EMODnet', { timeout: 15_000 });
    await expect(attribution(page)).toContainText('OpenSeaMap');
    await expect(attribution(page)).toContainText(/Esri/);
  });

  test('desligar as camadas remove os créditos', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.bathymetry', '1');
      localStorage.setItem('ventu.map.seamarks', '1');
    });
    await openMapa(page);

    await expect(attribution(page)).toContainText('EMODnet', { timeout: 15_000 });
    await expect(attribution(page)).toContainText('OpenSeaMap');

    await openMapLayersMenu(page);
    await page.locator('[data-map-bathymetry-toggle]').first().dispatchEvent('click');
    await page.locator('[data-map-seamarks-toggle]').first().dispatchEvent('click');

    await expect(attribution(page)).not.toContainText('EMODnet', { timeout: 15_000 });
    await expect(attribution(page)).not.toContainText('OpenSeaMap');
  });

  test('«OpenStreetMap contributors» aparece uma única vez no basemap', async ({ page }) => {
    await openMapa(page);

    const count = async () => {
      const text = (await attribution(page).textContent()) ?? '';
      return (text.match(/OpenStreetMap contributors/g) ?? []).length;
    };

    await expect(attribution(page)).toContainText('OpenStreetMap', { timeout: 15_000 });
    expect(await count()).toBe(1);

    // Depois de trocar para satélite o crédito OSM mantém-se único.
    // (M5: o rádio vive dentro do menu «Camadas» → abrir primeiro.)
    await openMapLayersMenu(page);
    await page.getByRole('radio', { name: 'Satélite' }).click();
    await expect(attribution(page)).toContainText(/Esri/, { timeout: 15_000 });
    expect(await count()).toBe(1);
  });

  test('crédito do Open-Meteo é localizado no mapa PT e canónico no EN', async ({ page }) => {
    await openMapa(page);

    // PT — lead-in traduzido, cadeia obrigatória (site + licença) intacta.
    await expect(attribution(page)).toContainText('Dados meteorológicos por', {
      timeout: 15_000,
    });
    await expect(attribution(page)).toContainText('Open-Meteo.com');
    await expect(attribution(page)).toContainText('CC BY 4.0');
    await expect(
      attribution(page).locator('a[href="https://open-meteo.com/"]'),
    ).toBeVisible();

    // EN — a cadeia canónica é a mesma usada no About/fontes/badge do radar.
    await page.goto('/en/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await expect(attribution(page)).toContainText('Weather data by Open-Meteo.com', {
      timeout: 15_000,
    });
  });
});
