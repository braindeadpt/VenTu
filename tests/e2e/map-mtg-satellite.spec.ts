import { expect, test, type Page } from '@playwright/test';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';

/**
 * Satélite IR — fonte MTG-I1 (pipeline EUMETSAT) vs fallback GIBS.
 *
 * A camada decide no mount: fetch de /data/sat-mtg.json → fresco (<3 h)
 * → frames WebP locais via L.imageOverlay; morto → tiles GOES-East GIBS.
 * Aqui interceptamos o manifest para os dois caminhos sem tocar na
 * EUMETSAT/NASA reais.
 */

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function manifest(framesAgo: number[]): object {
  const now = Date.now();
  return {
    source: 'eumetsat-mtg-fci',
    fetchedAt: new Date(now).toISOString(),
    cadenceMin: 10,
    bounds: { south: 28, west: -34, north: 52, east: 1 },
    attribution: 'EUMETSAT',
    frames: framesAgo.map((min) => {
      const t = new Date(now - min * 60_000);
      return {
        frameTime: t.toISOString(),
        imagePath: `sat-mtg/frames/vis-${t.toISOString().slice(0, 16)}.webp`,
        kind: 'vis',
      };
    }),
  };
}

async function stubMtg(page: Page, framesAgo: number[] | 'stale' | 'missing') {
  await page.route('**/data/sat-mtg.json*', (route) => {
    if (framesAgo === 'missing') return route.fulfill({ status: 404 });
    const ago = framesAgo === 'stale' ? [600, 590] : framesAgo;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(manifest(ago)),
    });
  });
  await page.route('**/data/sat-mtg/frames/*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }),
  );
  // O fallback GIBS pede tiles reais à NASA — devolve PNG vazio e conta-os.
  await page.route('**/gibs.earthdata.nasa.gov/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }),
  );
}

async function openMapa(page: Page, query = '') {
  await preseedWindRingLegend(page);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
}

async function enableSatellite(page: Page) {
  await openMapLayersMenu(page);
  const pop = page.locator('[data-map-layers-popover="true"]');
  const toggle = pop.locator('[data-map-goes-ir-toggle]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

test.describe('Satélite IR — MTG-I1 (pipeline EUMETSAT)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  test.describe.configure({ timeout: 90_000 });

  test('manifest fresco → imageOverlay local no pane ventu-goes-ir + carrossel', async ({
    page,
  }) => {
    await stubMtg(page, [70, 80, 90]);
    await openMapa(page);
    await enableSatellite(page);

    // imageOverlay = <img> directo no pane (não grid de tiles).
    const img = page.locator('.leaflet-ventu-goes-ir-pane img.leaflet-image-layer');
    await expect(img.first()).toBeVisible({ timeout: 15_000 });
    // Atribuição EUMETSAT no carrossel.
    await expect(page.getByText('MTG-I1 © EUMETSAT')).toBeVisible({ timeout: 10_000 });
  });

  test('manifest stale (>3 h) → fallback GIBS (tiles NASA pedidos)', async ({ page }) => {
    await stubMtg(page, 'stale');
    const gibsReqs: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('gibs.earthdata.nasa.gov')) gibsReqs.push(r.url());
    });
    await openMapa(page);
    await enableSatellite(page);

    await expect
      .poll(() => gibsReqs.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(page.getByText('GOES-East © NASA GIBS')).toBeVisible({ timeout: 10_000 });
  });

  test('manifest ausente → fallback GIBS', async ({ page }) => {
    await stubMtg(page, 'missing');
    const gibsReqs: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('gibs.earthdata.nasa.gov')) gibsReqs.push(r.url());
    });
    await openMapa(page);
    await enableSatellite(page);

    await expect
      .poll(() => gibsReqs.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
