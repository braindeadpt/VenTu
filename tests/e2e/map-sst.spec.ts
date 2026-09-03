import { test, expect } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';

const SPORTS = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const;

const TIMES = Array.from({ length: 16 }, (_, i) => {
  const h = 8 + i * 3;
  const day = 3 + Math.floor(h / 24);
  const hh = String(h % 24).padStart(2, '0');
  return `2026-09-${String(day).padStart(2, '0')}T${hh}:00`;
});

function series(at: Record<number, number>): number[] {
  return TIMES.map((_, i) => at[i] ?? 40);
}

function spotRow(at: Record<number, number>) {
  const s = series(at);
  const row: Record<string, number[]> = { best: s };
  for (const sport of SPORTS) row[sport] = s;
  return row;
}

const sst = TIMES.map((_, i) => (i === 0 ? 14 : i === 3 ? 22 : 18));
const thermal = TIMES.map((_, i) => (i === 3 ? 1 : 0));

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
    guincho: spotRow({ 0: 20, 3: 70 }),
    fonte: spotRow({ 0: 20, 3: 65 }),
  },
  sst: {
    nazare: sst,
    guincho: sst,
    fonte: sst,
  },
  thermal: {
    nazare: thermal,
    guincho: thermal,
    fonte: thermal,
  },
  hs: {
    nazare: TIMES.map((_, i) => (i === 0 ? 0.4 : 1.2)),
    guincho: TIMES.map((_, i) => 1.0),
    fonte: TIMES.map((_, i) => 0.8),
  },
};

async function openMapSst(page: import('@playwright/test').Page, query = 'hours=1&sst=1') {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto(`/pt/mapa/?${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map SST field', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('deep link ?sst=1 liga a fita; 08h→17h muda a SST interpolada', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapSst(page);

    await expect(page.locator('[data-map-sst-toggle]').first()).toBeVisible({ timeout: 15_000 });
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-sst', 'true', { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-sst-max', '14.0');
    await expect(page.locator('[data-map-sst-legend]')).toBeVisible();

    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await slider.fill('3');
    await expect(page.locator('[data-map-time-track-mode="hours"]')).toContainText('17h');
    await expect(map).toHaveAttribute('data-map-sst-max', '22.0');
    await expect(page.locator('[data-map-thermal-chip]')).toBeVisible();
    await expect(page.locator('[data-map-thermal-chip]')).toContainText('Brisa de mar');
  });

  test('?sst=1&hs=1 não empilha as duas fitas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapSst(page, 'hours=1&sst=1&hs=1');

    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-sst', 'true', { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-hs', 'false');
  });
});
