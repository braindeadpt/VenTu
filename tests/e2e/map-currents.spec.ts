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

const spd = TIMES.map((_, i) => (i === 0 ? 0.08 : i === 3 ? 0.27 : 0.12));
const dir = TIMES.map((_, i) => (i === 0 ? 180 : i === 3 ? 200 : 190));

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
  },
  currents: {
    nazare: { spd, dir },
  },
};

async function openMapCurrents(page: import('@playwright/test').Page) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto('/pt/mapa/?hours=1&currents=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map currents field', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('deep link ?currents=1 liga o campo; 08h→17h muda a velocidade interpolada', async ({ page }) => {
    await openMapCurrents(page);

    await expect(page.locator('[data-map-currents-toggle]').first()).toBeVisible({ timeout: 15_000 });
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-currents', 'true', { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-currents-frame', '0');
    await expect(map).toHaveAttribute('data-map-currents-max', '0.08');

    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await slider.fill('3');
    await expect(page.locator('[data-map-time-track-mode="hours"]')).toContainText('17h');
    await expect(map).toHaveAttribute('data-map-currents-max', '0.27');
  });
});
