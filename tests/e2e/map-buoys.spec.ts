import { test, expect } from '@playwright/test';
import { interceptIhBuoys, interceptWmoBuoys } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';

const FRESH_ISO = new Date().toISOString();
const STALE_12H = new Date(Date.now() - 12 * 3_600_000).toISOString();
const STALE_5H = new Date(Date.now() - 5 * 3_600_000).toISOString();

const IH_LIVE = {
  fetchedAt: FRESH_ISO,
  apiKeyConfigured: true,
  hasWaveData: true,
  stations: {
    '4': {
      idEst: 4,
      name: 'Leixões',
      lat: 41.3156,
      lon: -8.9825,
      status: 'active',
      wmoId: 6201077,
      latest: { date: FRESH_ISO, hm0: 1.4 },
    },
    '1': {
      idEst: 1,
      name: 'Nazaré Oceânica',
      lat: 39.5,
      lon: -9.8,
      status: 'inactive',
      latest: { date: '2025-01-01T00:00:00Z', hm0: 3 },
    },
  },
};

const WMO_MIXED = {
  fetchedAt: FRESH_ISO,
  hasWaveData: true,
  buoys: {
    '6201077': {
      code: '6201077',
      name: 'Porto',
      lat: 41.3156,
      lon: -8.9825,
      latest: { date: FRESH_ISO, hs: 1.5 },
    },
    '6200084': {
      code: '6200084',
      name: 'Cabo Silleiro',
      lat: 42.12,
      lon: -9.43,
      latest: { date: STALE_12H, hs: 2.1 },
    },
  },
};

const IH_STALE = {
  fetchedAt: STALE_5H,
  apiKeyConfigured: true,
  hasWaveData: true,
  stations: {
    '4': {
      ...IH_LIVE.stations['4'],
      latest: { date: STALE_5H, hm0: 1.4 },
    },
  },
};

const WMO_STALE = {
  fetchedAt: STALE_12H,
  hasWaveData: true,
  buoys: {
    '6200084': {
      code: '6200084',
      name: 'Cabo Silleiro',
      lat: 42.12,
      lon: -9.43,
      latest: { date: STALE_12H, hs: 2.1 },
    },
  },
};

async function openMapBuoys(
  page: import('@playwright/test').Page,
  query = '?buoys=1',
  ih: Record<string, unknown> = IH_LIVE,
  wmo: Record<string, unknown> = WMO_MIXED,
) {
  await preseedWindRingLegend(page);
  await interceptIhBuoys(page, ih);
  await interceptWmoBuoys(page, wmo);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

function buoyMarker(page: import('@playwright/test').Page, id: string) {
  return page.locator('.ventu-buoy-marker').filter({ has: page.locator(`[data-buoy-id="${id}"]`) });
}

test.describe('Map buoy dots', () => {
  test.use({ serviceWorkers: 'block' });
  test.describe.configure({ timeout: 60_000 });

  test('deep link ?buoys=1: Leixões fresco, Silleiro morto, sem clone WMO', async ({ page }) => {
    await openMapBuoys(page);

    await expect(page.locator('[data-map-buoys="true"]')).toBeVisible();
    const leixoes = buoyMarker(page, 'ih-4');
    await expect(leixoes).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-buoy-id="ih-4"]')).toHaveAttribute('data-buoy-fresh', 'true');
    await expect(page.locator('[data-buoy-id="ih-4"]')).toHaveAttribute('data-buoy-hs', '1.4');

    const silleiro = buoyMarker(page, 'wmo-6200084');
    await expect(silleiro).toBeVisible();
    await expect(page.locator('[data-buoy-id="wmo-6200084"]')).toHaveAttribute('data-buoy-fresh', 'false');

    await expect(page.locator('[data-buoy-id="wmo-6201077"]')).toHaveCount(0);
    await expect(page.locator('[data-buoy-id="ih-1"]')).toHaveCount(0);
  });

  test('popup da boia mostra Hs e a fonte IH', async ({ page }) => {
    await openMapBuoys(page);

    const marker = buoyMarker(page, 'ih-4');
    await expect(marker).toBeVisible({ timeout: 15_000 });
    await marker.click();
    const popup = page.locator('.ventu-buoy-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('Leixões');
    await expect(popup).toContainText('1.4');
    await expect(popup).toContainText('Instituto Hidrográfico');
  });

  test('aviso «Boias antigas» → Ver no mapa liga os pontos mortos', async ({ page }) => {
    await openMapBuoys(page, '', IH_STALE, WMO_STALE);

    const chip = page.locator('[data-buoy-layer-chip]');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();
    await page.locator('[data-buoy-show-on-map]').click();

    await expect(page.locator('[data-map-buoys="true"]')).toBeVisible();
    const leixoes = buoyMarker(page, 'ih-4');
    await expect(leixoes).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-buoy-id="ih-4"]')).toHaveAttribute('data-buoy-fresh', 'false');
  });
});

test.describe('Map buoy dots: prefers-reduced-motion', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('ponto fresco sem pulse CSS', async ({ page }) => {
    await openMapBuoys(page);

    const marker = buoyMarker(page, 'ih-4');
    await expect(marker).toBeVisible({ timeout: 15_000 });
    const ring = page.locator('[data-buoy-id="ih-4"] .ventu-buoy-ring');
    await expect(ring).toBeAttached();
    const animation = await ring.evaluate((el) => getComputedStyle(el).animationName);
    expect(animation === 'none' || animation === '').toBe(true);
  });
});
