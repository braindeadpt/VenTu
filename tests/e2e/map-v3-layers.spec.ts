import { test, expect, type Page } from '@playwright/test';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Map-v3 §8/§10 — menu Camadas agrupado (Base/Tempo/Mar/Navegação), rádio de
 * basemap dentro do menu (CORRECCOES-24SET), limite de 2 raster pesadas com
 * toast, e a acção de enquadramento por área exposta aos chips de ilha.
 */

async function openMapa(page: Page) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.mapdebug', '1');
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

const popover = (page: Page) => page.locator('[data-map-layers-popover="true"]');

test.describe('Menu Camadas v3 — grupos e basemap (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 90_000 });

  test('grupos Base/Tempo/Mar/Navegação, linhas com nome+descrição+switch e mini-legenda', async ({
    page,
  }) => {
    await openMapa(page);
    await openMapLayersMenu(page);
    const pop = popover(page);
    await expect(pop).toBeVisible({ timeout: 15_000 });

    // Cabeçalhos dos grupos (§8)
    for (const g of ['Base', 'Tempo', 'Mar', 'Navegação']) {
      await expect(pop.getByText(g, { exact: true }).first()).toBeVisible();
    }

    // «Base»: rádio Mapa/Satélite com aria-checked — estado real do mapa.
    const radioMap = pop.locator('[data-map-basemap-radio="map"]');
    const radioSat = pop.locator('[data-map-basemap-radio="satellite"]');
    await expect(radioMap).toHaveAttribute('role', 'radio');
    await expect(radioMap).toHaveAttribute('aria-checked', 'true');
    await expect(radioSat).toHaveAttribute('aria-checked', 'false');

    // Linha de camada: nome substantivo + descrição muted + switch (aria-pressed).
    const isob = pop.locator('[data-map-isobaths-toggle]');
    await expect(isob).toContainText('Isóbatas');
    await expect(isob).toHaveAttribute('aria-pressed', 'false');

    // Ao ligar aparece a mini-legenda inline (8/16/30 m).
    await isob.click();
    await expect(isob).toHaveAttribute('aria-pressed', 'true');
    await expect(pop.locator('[data-map-layer-minilegend="isobaths"]')).toBeVisible();
    await expect(pop.getByText('8 m', { exact: false }).first()).toBeVisible();
  });

  test('o rádio de basemap dentro do menu muda o mapa e o estado reflete-se', async ({ page }) => {
    await openMapa(page);
    await openMapLayersMenu(page);
    const pop = popover(page);
    await expect(pop).toBeVisible({ timeout: 15_000 });

    await pop.locator('[data-map-basemap-radio="satellite"]').click();
    await expect(page.locator('.leaflet-container')).toHaveAttribute('data-basemap', 'satellite', {
      timeout: 10_000,
    });
    await expect(pop.locator('[data-map-basemap-radio="satellite"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(pop.locator('[data-map-basemap-radio="map"]')).toHaveAttribute(
      'aria-checked',
      'false',
    );

    await pop.locator('[data-map-basemap-radio="map"]').click();
    await expect(page.locator('.leaflet-container')).toHaveAttribute('data-basemap', 'map', {
      timeout: 10_000,
    });
  });

  test('o basemap já não vive no painel do modo Explorar', async ({ page }) => {
    await openMapa(page);
    // Painel desktop: Mapa/Satélite já não aparece dentro dele (M5 moveu-o
    // para o menu Camadas) — o radiogroup só existe no popover.
    await openMapLayersMenu(page);
    await expect(popover(page).getByRole('radiogroup', { name: 'Mapa base' })).toBeVisible({
      timeout: 15_000,
    });
    const panelRadios = page
      .locator('[data-map-panel]')
      .getByRole('radiogroup', { name: 'Mapa base' });
    await expect(panelRadios).toHaveCount(0);
  });

  test('limite de 2 raster pesadas: a 3.ª desliga a mais antiga e avisa por toast', async ({
    page,
  }) => {
    await openMapa(page);
    await openMapLayersMenu(page);
    const pop = popover(page);
    await expect(pop).toBeVisible({ timeout: 15_000 });

    // Liga batimetria + sinalização (2 raster pesadas).
    await pop.locator('[data-map-bathymetry-toggle]').click();
    await expect(pop.locator('[data-map-bathymetry-toggle]')).toHaveAttribute('aria-pressed', 'true');
    await pop.locator('[data-map-seamarks-toggle]').click();
    await expect(pop.locator('[data-map-seamarks-toggle]')).toHaveAttribute('aria-pressed', 'true');

    // 3.ª pesada (radar — primário no strip): desliga a mais antiga (batimetria).
    await page.locator('[data-map-controls] [data-map-radar-toggle]').click();
    await expect(page.locator('[data-map-controls] [data-map-radar-toggle]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Toast localizado «Batimetria — camada desligada…».
    await expect(
      page.getByText(/Batimetria — camada desligada para manter o mapa fluido/),
    ).toBeVisible({ timeout: 10_000 });

    // Estado resultante: seamarks + radar ligados, batimetria desligada.
    // (O clique no strip fechou o popover — reabre-se para verificar.)
    await openMapLayersMenu(page);
    await expect(pop.locator('[data-map-seamarks-toggle]')).toHaveAttribute('aria-pressed', 'true');
    await expect(pop.locator('[data-map-bathymetry-toggle]')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('Enquadramento por área (§10 — acção dos chips de ilha)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 90_000 });

  async function mapCenter(page: Page): Promise<{ lat: number; lng: number }> {
    return page.evaluate(() => {
      const map = (window as unknown as { __VENTU_MAP__?: { getCenter(): { lat: number; lng: number } } }).__VENTU_MAP__;
      if (!map) throw new Error('__VENTU_MAP__ ausente');
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    });
  }

  test('ventu:map-fit-area enquadra Açores/Madeira/continente', async ({ page }) => {
    await openMapa(page);
    await page.locator('.leaflet-container[data-map-settled="true"]').waitFor({ timeout: 30_000 });

    // Açores — o centro salta para o Atlântico central.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('ventu:map-fit-area', { detail: 'azores' })),
    );
    await expect.poll(async () => (await mapCenter(page)).lng, { timeout: 15_000 }).toBeLessThan(-24);
    const az = await mapCenter(page);
    expect(az.lng).toBeGreaterThan(-32);
    expect(az.lat).toBeGreaterThan(36.5);
    expect(az.lat).toBeLessThan(40);

    // Madeira.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('ventu:map-fit-area', { detail: 'madeira' })),
    );
    await expect
      .poll(async () => (await mapCenter(page)).lng, { timeout: 15_000 })
      .toBeGreaterThan(-18);
    const md = await mapCenter(page);
    expect(md.lng).toBeLessThan(-16);

    // Continente — volta para a costa portuguesa.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('ventu:map-fit-area', { detail: 'continent' })),
    );
    await expect
      .poll(async () => (await mapCenter(page)).lng, { timeout: 15_000 })
      .toBeGreaterThan(-11);
    const pt = await mapCenter(page);
    expect(pt.lat).toBeGreaterThan(36);
    expect(pt.lat).toBeLessThan(42);
  });

  test('o enquadramento inicial mantém a costa continental no viewport útil', async ({ page }) => {
    await openMapa(page);
    await page.locator('.leaflet-container[data-map-settled="true"]').waitFor({ timeout: 30_000 });

    // Extremos da costa continental projectados para px do container: têm de
    // ficar à DIREITA do painel (moldura) e dentro da área vertical útil.
    const usableLeft = await page.evaluate(() => {
      const panel = document.querySelector('[data-map-panel]');
      const state = panel?.getAttribute('data-map-panel');
      return state === 'rail' ? 64 : state === 'open' ? 372 : 16;
    });
    const pts = await page.evaluate(() => {
      const map = (window as unknown as { __VENTU_MAP__?: { latLngToContainerPoint(ll: [number, number]): { x: number; y: number } } }).__VENTU_MAP__;
      if (!map) throw new Error('__VENTU_MAP__ ausente');
      // NW (Minho), SW (Sagres) e a raia — a bbox da costa.
      const corners: Array<[number, number]> = [
        [41.85, -8.9],
        [37.0, -8.95],
        [41.8, -6.95],
        [37.0, -6.95],
      ];
      return corners.map((ll) => map.latLngToContainerPoint(ll));
    });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(usableLeft - 8);
      expect(p.x).toBeLessThanOrEqual(1440);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(900);
    }
  });
});

test.describe('Menu Camadas v3 — mobile sheet', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  test.describe.configure({ timeout: 90_000 });

  test('a secção Camadas do sheet tem grupo Base com o rádio e cabeçalhos', async ({ page }) => {
    await openMapa(page);
    const sheet = page.locator('[data-explore-sheet]');
    await page.locator('[data-sheet-grabber]').click(); // peek → half
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'half', { timeout: 15_000 });

    // O basemap moveu-se do «Ver também» para a secção Camadas (grupo Base).
    await expect(sheet.getByRole('radiogroup', { name: 'Mapa base' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(sheet.getByText('Base', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Tempo', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Mar', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Navegação', { exact: true })).toBeVisible();

    // O rádio muda o mapa a partir do sheet.
    await sheet.getByRole('radio', { name: 'Satélite' }).click();
    await expect(page.locator('.leaflet-container')).toHaveAttribute('data-basemap', 'satellite', {
      timeout: 10_000,
    });
  });
});
