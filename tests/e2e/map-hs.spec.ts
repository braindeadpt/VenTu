import { test, expect } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';

/**
 * O campo «Altura significativa (Hs)» (IDW entre spots) saiu do menu
 * «Camadas» em 2026-10: a «Ondulação» (grelha de modelo sea-grid.json) é a
 * fonte única da altura das ondas no /mapa e vive no selector
 * «Vento | Ondulação | Nenhum». Links antigos `?hs=1` abrem a «Ondulação».
 * O selector em si está coberto em map-sea-mode.spec.ts.
 */

const TIMES = Array.from({ length: 16 }, (_, i) => {
  const h = 8 + i * 3;
  const day = 3 + Math.floor(h / 24);
  const hh = String(h % 24).padStart(2, '0');
  return `2026-09-${String(day).padStart(2, '0')}T${hh}:00`;
});

const MAP_HOURS_STUB = {
  generatedAt: 'Thu 2026-09-03 8:00 AM WEST (UTC+01:00)',
  stepHours: 3,
  times: TIMES,
  sports: ['surf'],
  spots: { nazare: { best: TIMES.map(() => 40), surf: TIMES.map(() => 40) } },
  hs: { nazare: TIMES.map(() => 1) },
};

test.describe('Hs legado → «Ondulação»', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  test.describe.configure({ timeout: 60_000 });

  test('?hs=1 abre a «Ondulação» no selector; o menu já não tem Hs nem Ondulação', async ({ page }) => {
    await preseedWindRingLegend(page);
    await interceptMapHours(page, MAP_HOURS_STUB);
    await page.goto('/pt/mapa/?hs=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const group = page.getByRole('radiogroup', { name: 'Camada sobre o mar' });
    await expect(group).toBeVisible({ timeout: 15_000 });
    await expect(group.getByRole('radio', { name: 'Ondulação' })).toHaveAttribute('aria-checked', 'true');

    const map = page.locator('.leaflet-container');
    // o IDW antigo nunca liga
    await expect(map).toHaveAttribute('data-map-hs', 'false');
    // o URL passa a falar a língua nova
    await expect.poll(() => new URL(page.url()).searchParams.get('swell')).toBe('1');
    expect(new URL(page.url()).searchParams.get('hs')).toBeNull();

    await openMapLayersMenu(page);
    const popover = page.locator('[data-map-layers-popover="true"]');
    await expect(popover.locator('[data-map-sst-toggle]')).toBeVisible({ timeout: 15_000 });
    await expect(popover.locator('[data-map-hs-toggle]')).toHaveCount(0);
    await expect(popover.locator('[data-map-swell-toggle]')).toHaveCount(0);
  });

  test('uma pref antiga do Hs migra para a «Ondulação»', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.hs', '1');
    });
    await interceptMapHours(page, MAP_HOURS_STUB);
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    const group = page.getByRole('radiogroup', { name: 'Camada sobre o mar' });
    await expect(group.getByRole('radio', { name: 'Ondulação' })).toHaveAttribute('aria-checked', 'true', {
      timeout: 15_000,
    });
    await expect(page.locator('.leaflet-container')).toHaveAttribute('data-map-hs', 'false');
    expect(await page.evaluate(() => localStorage.getItem('ventu.map.hs'))).toBe('0');
  });
});
