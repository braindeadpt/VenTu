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

const wSpd = TIMES.map(() => 8); // ~15 kt — campo bem visível
const wDir = TIMES.map(() => 0); // de norte → sopra para sul

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 60 }),
  },
  wind: {
    nazare: { spd: wSpd, dir: wDir },
  },
};

async function openMap(page: import('@playwright/test').Page) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.wind', '1');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map wind field', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('o toggle Vento liga o canvas do campo; desligar remove-o', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(page.locator('[data-map-wind="true"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(1);

    // desligar o toggle remove o canvas e marca o atributo a false
    await page.getByRole('button', { name: 'Ocultar vento' }).first().click();
    await expect(map).toHaveAttribute('data-map-windfield', 'false');
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(0);
  });

  test('sem bloco wind no ficheiro o campo não abre (graceful)', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.wind', '1');
    });
    const { wind: _omit, ...noWind } = MAP_HOURS_STUB;
    await interceptMapHours(page, noWind);
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    const map = page.locator('.leaflet-container');
    await page.waitForTimeout(3000);
    await expect(map).toHaveAttribute('data-map-windfield', 'false');
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(0);
  });
});
