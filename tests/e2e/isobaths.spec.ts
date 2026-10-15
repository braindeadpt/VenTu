import { test, expect } from '@playwright/test';
import { openMapLayersMenu } from './helpers/map-setup';

/**
 * Contornos simplificados (isobaths-contours.json) com linhas perto da
 * Nazaré (lat 39.608, lon -9.086) — vértices dentro do raio de 14 km.
 */
const NAZARE_CONTOURS = {
  depths: [8, 16, 30],
  vertexCount: 7,
  contours: {
    '8': [[[-9.15, 39.5], [-9.08, 39.55], [-9.05, 39.6]]],
    '16': [[[-9.18, 39.5], [-9.12, 39.58]]],
    '30': [[[-9.22, 39.5], [-9.16, 39.6]]],
  },
};

const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function interceptContours(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/data/isobaths-contours.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(NAZARE_CONTOURS),
    });
  });
  // A «Carta náutica» fundida liga os três sub-layers — EMODnet e
  // OpenSeaMap disparam com as isóbatas; sem interceptação o networkidle
  // do goto pendura nos hosts reais (spec hermética).
  for (const host of ['**/ows.emodnet-bathymetry.eu/**', '**/tiles.openseamap.org/**']) {
    await page.route(host, async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_PIXEL });
    });
  }
}

// A página de spot v6 (#184) já não tem o «Fundo perto da praia» (IsobathsStrip,
// no antigo painel «Agora», retirado com os duplicados): as isóbatas vivem no
// /mapa interactivo e no hero da homepage, cobertos pelos describes abaixo.

test.describe('Isóbatas — camada no mapa interactivo (/mapa)', () => {
  test.use({ serviceWorkers: 'block' });

  test('toggle liga a camada e mostra a legenda de profundidade', async ({ page }) => {
    await interceptContours(page);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    // C4: o toggle «Carta náutica» (isóbatas+batimetria+seamarks, Fase 3)
    // vive no menu «Camadas».
    await openMapLayersMenu(page);
    const toggle = page.locator('[data-map-nautical-chart-toggle]');
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    // M5: o item do menu tem nome estável — o estado vai em aria-pressed.
    const active = page.locator('[data-map-nautical-chart-toggle]');
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    // Legenda inline (dentro da MapLegend) com as três profundidades.
    const inline = page.getByTestId('isobaths-legend-inline');
    await expect(inline).toBeVisible({ timeout: 15_000 });
    await expect(inline.getByText('8 m')).toBeVisible();
    await expect(inline.getByText('30 m')).toBeVisible();
    const legend = page.getByRole('region', { name: /Legenda do mapa|Map legend/i });
    const panel = page.locator('[data-map-panel="open"]');
    const legendBox = await legend.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(legendBox).toBeTruthy();
    expect(panelBox).toBeTruthy();
    // Legenda no canto inf. direito, painel na margem esquerda — sem sobreposição.
    expect(legendBox!.x).toBeGreaterThanOrEqual(panelBox!.x + panelBox!.width - 1);
    // A camada desenha polylines no pane de overlays do Leaflet.
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible({
      timeout: 15_000,
    });
    // Atribuição do IH no controlo.
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      /Isóbatas © Instituto Hidrográfico/,
      { timeout: 15_000 },
    );
  });
});

test.describe('Carta náutica — preferência persistida e deep link (?isobaths=1 legado)', () => {
  test.use({ serviceWorkers: 'block' });

  const LS_KEY = 'ventu.map.nauticalChart';

  async function openMapa(page: import('@playwright/test').Page, qs = '') {
    await interceptContours(page);
    await page.goto(`/pt/mapa/${qs}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  }

  test('?nauticalChart=1 liga a carta à entrada (ao lado do radar)', async ({ page }) => {
    await openMapa(page, '?nauticalChart=1');
    await openMapLayersMenu(page);
    const active = page.locator('[data-map-nautical-chart-toggle]');
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
  });

  test('?isobaths=1 (link de partilha legado) também liga a carta', async ({ page }) => {
    await openMapa(page, '?isobaths=1');
    await openMapLayersMenu(page);
    const active = page.locator('[data-map-nautical-chart-toggle]');
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
  });

  test('preferência persistida off é restaurada no /mapa', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '0'), LS_KEY);
    await openMapa(page);
    await openMapLayersMenu(page);
    const off = page.locator('[data-map-nautical-chart-toggle]');
    await expect(off).toBeVisible({ timeout: 15_000 });
    await expect(off).toHaveAttribute('aria-pressed', 'false');
  });

  test('a key legada isóbatas=1 migra para a carta ligada', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ventu.map.isobaths', '1'));
    await openMapa(page);
    await openMapLayersMenu(page);
    const active = page.locator('[data-map-nautical-chart-toggle]');
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
  });

  test('toggle grava a preferência em localStorage', async ({ page }) => {
    await openMapa(page);
    await openMapLayersMenu(page);
    const off = page.locator('[data-map-nautical-chart-toggle]');
    await expect(off).toBeVisible({ timeout: 15_000 });
    await off.click();
    await expect(page.locator('[data-map-nautical-chart-toggle]')).toHaveAttribute(
      'aria-pressed', 'true', { timeout: 15_000 },
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), LS_KEY)).toBe('1');
  });
});

test.describe('Carta náutica — hero da homepage (TopMap), camada partilhada', () => {
  test.use({ serviceWorkers: 'block' });

  test('o toggle está ligado por omissão no hero e desliga/religa a camada', async ({
    page,
  }) => {
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero).toBeVisible({ timeout: 20_000 });

    // A camada partilhada do SpotMapInteractive arranca ligada no hero —
    // o botão «Carta náutica» tem nome estável (o estado vai em aria-pressed).
    const toggle = hero.getByRole('button', { name: 'Carta náutica' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Desligar.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });

    // Voltar a ligar: a camada desenha polylines no pane de overlays.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(hero.locator('.leaflet-overlay-pane path').first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
