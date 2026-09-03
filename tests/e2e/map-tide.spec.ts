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

const TIDE_TIMES: string[] = [];
const TIDE_HEIGHT: number[] = [];
for (let i = 0; i < 48; i++) {
  const h = 8 + i;
  const day = 3 + Math.floor(h / 24);
  const hh = String(h % 24).padStart(2, '0');
  TIDE_TIMES.push(`2026-09-${String(day).padStart(2, '0')}T${hh}:00`);
  TIDE_HEIGHT.push(Math.sin((i / 12) * Math.PI));
}

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
  },
  tides: {
    Lisboa: { spotId: 'guincho', times: TIDE_TIMES, height: TIDE_HEIGHT },
  },
};

async function openMapTide(page: import('@playwright/test').Page) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto('/pt/mapa/?hours=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map tide chip', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('no trilho: 08h→17h muda fase e hora da próxima extrema', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapTide(page);

    const track = page.locator('[data-map-time-track-mode="hours"]');
    await expect(track).toBeVisible({ timeout: 15_000 });
    await expect(track).toContainText('08h');

    const chip = page.locator('[data-map-tide-chip]');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('a subir');
    const morning = (await chip.textContent())?.trim() ?? '';
    expect(morning).toMatch(/\d{2}:\d{2}/);

    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await slider.fill('3');
    await expect(track).toContainText('17h');
    await expect(chip).toContainText('a descer');
    const afternoon = (await chip.textContent())?.trim() ?? '';
    expect(afternoon).not.toBe(morning);
  });
});
