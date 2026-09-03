import { test, expect } from '@playwright/test';
import { interceptIsobaths } from './helpers/conditions';

/**
 * Contornos simplificados (isobaths-contours.json) com linhas perto da
 * Nazaré (lat 39.597, lon -9.073) — vértices dentro do raio de 14 km.
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

async function interceptContours(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/data/isobaths-contours.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(NAZARE_CONTOURS),
    });
  });
}

/**
 * IsobathsStrip — «Fundo perto da praia» (IH depcnt_8_16_30).
 *
 * The strip reads spot-isobaths.json client-side and shows the distance from
 * the beach to the nearest 8/16/30 m depth contour. Renders nothing when the
 * spot has no nearby contour or the file is missing.
 */

test.describe('IsobathsStrip (Fundo perto da praia)', () => {
  test.use({ serviceWorkers: 'block' });

  const NAZARE_ISOBATHS = {
    spots: { nazare: { 8: 0.25, 16: 0.31, 30: 0.46 } },
    fetchedAt: '2026-08-15T08:00:00Z',
    sourceCollection: 'depcnt_8_16_30',
    depths: [8, 16, 30],
  };

  test('mostra as distâncias às isóbatas 8/16/30 m no dashboard do spot', async ({ page }) => {
    await interceptIsobaths(page, NAZARE_ISOBATHS);
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    const strip = page.getByTestId('isobaths-strip');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    await expect(strip.getByText('Fundo perto da praia')).toBeVisible();
    // Distâncias em metros (< 1 km) — Nazaré funde rápido.
    await expect(strip.getByText('250 m')).toBeVisible();
    await expect(strip.getByText('310 m')).toBeVisible();
    await expect(strip.getByText('460 m')).toBeVisible();
    // Atribuição honesta.
    await expect(strip.getByText(/Isóbatas IH \(CC-BY 4\.0\)/)).toBeVisible();
  });

  test('spot sem contornos próximos → o strip não aparece', async ({ page }) => {
    // O spot existe no ficheiro mas sem nenhuma profundidade dentro do raio.
    await interceptIsobaths(page, {
      spots: { nazare: {} },
      fetchedAt: '2026-08-15T08:00:00Z',
      sourceCollection: 'depcnt_8_16_30',
      depths: [8, 16, 30],
    });
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('isobaths-strip')).toHaveCount(0);
  });

  test('ficheiro ausente (404) → o strip não aparece e a página não quebra', async ({ page }) => {
    await page.route('**/data/spot-isobaths.json', async (route) => route.fulfill({ status: 404 }));
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('isobaths-strip')).toHaveCount(0);
  });
});

test.describe('Isóbatas — overlay vectorial (mapa da página de spot)', () => {
  test.use({ serviceWorkers: 'block' });

  test('contornos perto do spot → polylines + legenda de profundidade + atribuição IH', async ({
    page,
  }) => {
    await interceptIsobaths(page, { spots: { nazare: { 8: 0.25, 16: 0.31, 30: 0.46 } } });
    await interceptContours(page);
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    // Camada vectorial: o container Leaflet marca as isóbatas desenhadas.
    await expect(
      page.locator('.leaflet-container[data-isobaths="true"]'),
    ).toHaveCount(1);
    // Legenda de profundidade (chip) com as três profundidades.
    const legend = page.getByTestId('isobaths-legend');
    await expect(legend).toBeVisible({ timeout: 15_000 });
    await expect(legend.getByText('8 m')).toBeVisible();
    await expect(legend.getByText('16 m')).toBeVisible();
    await expect(legend.getByText('30 m')).toBeVisible();
    // Atribuição do IH (CC BY 4.0) junta-se à do basemap no controlo.
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      /Isóbatas © Instituto Hidrográfico/,
      { timeout: 15_000 },
    );
  });

  test('sem contornos perto do spot → sem overlay nem legenda', async ({ page }) => {
    await interceptIsobaths(page, { spots: { nazare: {} } });
    await interceptContours(page);
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(
      page.locator('.leaflet-container[data-isobaths="true"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId('isobaths-legend')).toHaveCount(0);
  });

  test('ficheiro de contornos ausente (404) → mapa intacto sem overlay', async ({ page }) => {
    await interceptIsobaths(page, { spots: { nazare: { 8: 0.25 } } });
    await page.route('**/data/isobaths-contours.json', async (route) =>
      route.fulfill({ status: 404, body: 'nope' }),
    );
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(
      page.locator('.leaflet-container[data-isobaths="true"]'),
    ).toHaveCount(0);
    // A strip de distâncias continua a funcionar (a falha é só do overlay).
    await expect(page.getByTestId('isobaths-strip')).toBeVisible();
  });
});

test.describe('Isóbatas — camada no mapa interactivo (/mapa)', () => {
  test.use({ serviceWorkers: 'block' });

  test('toggle liga a camada e mostra a legenda de profundidade', async ({ page }) => {
    await interceptContours(page);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    // HUD do modo explorar: botão de isóbatas (off por omissão).
    const toggle = page.getByRole('button', { name: 'Isóbatas 8/16/30 m' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    // O aria-label muda ao ligar (show → hide) — re-consultar pelo novo nome.
    const active = page.getByRole('button', { name: 'Ocultar isóbatas' });
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    // Legenda inline (dentro da MapLegend) com as três profundidades.
    const inline = page.getByTestId('isobaths-legend-inline');
    await expect(inline).toBeVisible({ timeout: 15_000 });
    await expect(inline.getByText('8 m')).toBeVisible();
    await expect(inline.getByText('30 m')).toBeVisible();
    const legend = page.getByRole('region', { name: /Legenda do mapa|Map legend/i });
    const hud = page.locator('[data-map-hud-collapsed]');
    const legendBox = await legend.boundingBox();
    const hudBox = await hud.boundingBox();
    expect(legendBox).toBeTruthy();
    expect(hudBox).toBeTruthy();
    expect((legendBox?.y ?? 0) + (legendBox?.height ?? 0)).toBeLessThanOrEqual((hudBox?.y ?? 0) + 2);
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

test.describe('Isóbatas — preferência persistida e deep link (?isobaths=1)', () => {
  test.use({ serviceWorkers: 'block' });

  const LS_KEY = 'ventu.map.isobaths';

  async function openMapa(page: import('@playwright/test').Page, qs = '') {
    await interceptContours(page);
    await page.goto(`/pt/mapa/${qs}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  }

  test('?isobaths=1 liga as isóbatas à entrada (ao lado do radar)', async ({ page }) => {
    await openMapa(page, '?isobaths=1');
    const active = page.getByRole('button', { name: 'Ocultar isóbatas' });
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
  });

  test('preferência persistida off é restaurada no /mapa', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '0'), LS_KEY);
    await openMapa(page);
    const off = page.getByRole('button', { name: 'Isóbatas 8/16/30 m' });
    await expect(off).toBeVisible({ timeout: 15_000 });
    await expect(off).toHaveAttribute('aria-pressed', 'false');
  });

  test('toggle grava a preferência em localStorage', async ({ page }) => {
    await openMapa(page);
    const off = page.getByRole('button', { name: 'Isóbatas 8/16/30 m' });
    await expect(off).toBeVisible({ timeout: 15_000 });
    await off.click();
    await expect(page.getByRole('button', { name: 'Ocultar isóbatas' })).toBeVisible({
      timeout: 15_000,
    });
    expect(await page.evaluate((key) => localStorage.getItem(key), LS_KEY)).toBe('1');
  });
});

test.describe('Isóbatas — hero da homepage (TopMap), camada partilhada', () => {
  test.use({ serviceWorkers: 'block' });

  test('o toggle está ligado por omissão no hero e desliga/religa a camada', async ({
    page,
  }) => {
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero).toBeVisible({ timeout: 20_000 });

    // A camada partilhada do SpotMapInteractive arranca ligada no hero.
    await expect(hero.getByRole('button', { name: 'Ocultar isóbatas' })).toBeVisible(
      { timeout: 15_000 },
    );
    const on = hero.getByRole('button', { name: 'Ocultar isóbatas' });
    await expect(on).toHaveAttribute('aria-pressed', 'true');

    // Desligar: o botão passa a «Isóbatas 8/16/30 m» (pronto a ligar de novo).
    await on.click();
    const off = hero.getByRole('button', { name: 'Isóbatas 8/16/30 m' });
    await expect(off).toBeVisible({ timeout: 15_000 });
    await expect(off).toHaveAttribute('aria-pressed', 'false');

    // Voltar a ligar: a camada desenha polylines no pane de overlays.
    await off.click();
    await expect(hero.getByRole('button', { name: 'Ocultar isóbatas' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(hero.locator('.leaflet-overlay-pane path').first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
