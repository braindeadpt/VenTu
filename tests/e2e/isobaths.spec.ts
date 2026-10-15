import { test, expect } from '@playwright/test';
import { interceptIsobaths } from './helpers/conditions';
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

/**
 * «Fundo perto da praia» na página de spot v6 (#184) — isóbatas IH
 * (depcnt_8_16_30): distância da praia ao contorno de 8/16/30 m, desenhada num
 * perfil do fundo no fim do «Estudar o spot» (MedeSabeV6, decisão do Pedro de
 * 2026-10-15). Lê spot-isobaths.json no cliente; não aparece quando o spot não
 * tem contornos perto ou o ficheiro falta.
 */
test.describe('Fundo perto da praia (isóbatas IH, «Estudar o spot» v6)', () => {
  test.use({ serviceWorkers: 'block' });

  async function abreEstudo(page: import('@playwright/test').Page) {
    const estudo = page.locator('#estudo');
    await expect(async () => {
      if ((await estudo.getAttribute('open')) === null) await estudo.locator('summary').click({ timeout: 3_000 });
      await expect(estudo).toHaveAttribute('open', '', { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
  }

  const NAZARE_ISOBATHS = {
    spots: { nazare: { 8: 0.25, 16: 0.31, 30: 0.46 } },
    fetchedAt: 'Sat 2026-08-15 9:00 AM WEST (UTC+01:00)',
    sourceCollection: 'depcnt_8_16_30',
    depths: [8, 16, 30],
  };

  test('mostra as distâncias às isóbatas 8/16/30 m num perfil do fundo', async ({ page }) => {
    await interceptIsobaths(page, NAZARE_ISOBATHS);
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({ timeout: 20_000 });
    await abreEstudo(page);

    const fundo = page.getByTestId('isobaths-strip');
    await expect(fundo).toHaveCount(1);
    await expect(fundo).toBeVisible({ timeout: 20_000 });
    await expect(fundo.getByText('Fundo perto da praia')).toBeVisible();
    // Distâncias em metros (< 1 km) — a Nazaré afunda depressa.
    await expect(fundo.getByText('250 m')).toBeVisible();
    await expect(fundo.getByText('310 m')).toBeVisible();
    await expect(fundo.getByText('460 m')).toBeVisible();
    await expect(fundo.getByText(/O fundo desce depressa/)).toBeVisible();
    // O perfil desenhado diz o mesmo por extenso (leitor de ecrã).
    await expect(fundo.getByRole('img', { name: /Perfil do fundo: 8 m a 250 m · 16 m a 310 m · 30 m a 460 m/ })).toBeVisible();
    // Atribuição honesta.
    await expect(fundo.getByText(/Isóbatas IH \(CC-BY 4\.0\)/)).toBeVisible();
    // Estilo v6, dentro do «Estudar o spot».
    await expect(page.locator('#estudo [data-testid="isobaths-strip"]')).toHaveCount(1);
    expect(await fundo.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(12, 42, 66)');
  });

  test('spot sem contornos próximos → o perfil não aparece', async ({ page }) => {
    await interceptIsobaths(page, {
      spots: { nazare: {} },
      fetchedAt: 'Sat 2026-08-15 9:00 AM WEST (UTC+01:00)',
      sourceCollection: 'depcnt_8_16_30',
      depths: [8, 16, 30],
    });
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({ timeout: 20_000 });
    await abreEstudo(page);
    await page.waitForTimeout(1_500);
    await expect(page.getByTestId('isobaths-strip')).toHaveCount(0);
  });

  test('ficheiro ausente (404) → o perfil não aparece e a página não quebra', async ({ page }) => {
    await page.route('**/data/spot-isobaths.json', async (route) => route.fulfill({ status: 404 }));
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({ timeout: 20_000 });
    await abreEstudo(page);
    await page.waitForTimeout(1_500);
    await expect(page.getByTestId('isobaths-strip')).toHaveCount(0);
    await expect(page.locator('#estudo [data-ec="mare-lua"]')).toBeVisible();
  });
});

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
