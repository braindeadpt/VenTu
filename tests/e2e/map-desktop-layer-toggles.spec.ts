import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expectTopmostHit } from './helpers/hit-test';

/**
 * Audit desktop da coluna MapControls em /pt/mapa/ (1280×800):
 *   1. cada toggle é o elemento de topo no seu centro (a coluna clipa em
 *      max-h — o último controlo pode ficar fora da vista);
 *   2. o toggle persiste em localStorage e é reposto após um ciclo
 *      fechar/abrir da página (navegação real, não reload);
 *   3. o deep link ?<layer>=1 vence o localStorage (precedência confirmada
 *      nos hooks: initialEnabled → LS → false) e liga a camada;
 *   4. desligar por deep link... não: desligar POR TOGGLE grava '0' e o
 *      estado sobrevive ao ciclo — o deep link só é lido no arranque.
 *
 * Precedência (useMapCurrentsField.ts e irmãos): o estado inicial é
 * `initialEnabled (deep link)` → LS '1'/'0' → false; o toggle grava LS.
 */

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

/** Fixture com todos os campos → toggles nascem disponíveis. */
const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
  },
  currents: {
    nazare: { spd: TIMES.map(() => 0.2), dir: TIMES.map(() => 190) },
  },
  sst: { nazare: series({}) },
  hs: { nazare: series({}) },
};

async function openMapaDesktop(page: Page, query = ''): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

/** Ciclo fechar/abrir: navega para fora e volta (não é reload). */
async function closeAndReopen(page: Page, query = ''): Promise<void> {
  await page.goto('/pt/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitHydrated(page);
  await openMapaDesktop(page, query);
}

const LAYERS = [
  { name: 'correntes', param: 'currents', attr: 'data-map-currents-toggle', lsKey: 'ventu.map.currents' },
  { name: 'temperatura (SST)', param: 'sst', attr: 'data-map-sst-toggle', lsKey: 'ventu.map.sst' },
  { name: 'altura significativa (HS)', param: 'hs', attr: 'data-map-hs-toggle', lsKey: 'ventu.map.hs' },
  { name: 'isóbatas', param: 'isobaths', attr: 'data-map-isobaths-toggle', lsKey: 'ventu.map.isobaths' },
  { name: 'radar IPMA', param: 'radar', attr: 'data-map-radar-toggle', lsKey: 'ventu.radar.state' },
] as const;

test.describe('Mapa desktop — coluna de controlos: persistência e deep links', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  test.describe.configure({ timeout: 60_000 });

  for (const l of LAYERS) {
    test(`«${l.name}»: hit-testável, persiste e sobrevive ao ciclo fechar/abrir`, async ({
      page,
    }) => {
      await openMapaDesktop(page);

      const toggle = page.locator('[data-map-controls]').locator(`[${l.attr}]`);
      await expect(toggle).toBeEnabled({ timeout: 15_000 });
      // A coluna clipa (max-h): o último controlo pode precisar de scroll.
      await toggle.scrollIntoViewIfNeeded();
      await expectTopmostHit(page, toggle);

      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');

      const stored = await page.evaluate((key) => localStorage.getItem(key), l.lsKey);
      if (l.lsKey === 'ventu.radar.state') {
        expect(stored, 'ventu.radar.state escrito').toBeTruthy();
      } else {
        expect(stored).toBe('1');
      }

      // Ciclo fechar/abrir (navegação real): a preferência sobrevive.
      await closeAndReopen(page);
      const after = page.locator('[data-map-controls]').locator(`[${l.attr}]`);
      await expect(after).toBeEnabled({ timeout: 15_000 });
      await expect(after).toHaveAttribute('aria-pressed', 'true');
    });

    test(`deep link ?${l.param}=1 vence o localStorage desligado`, async ({ page }) => {
      await openMapaDesktop(page);
      // Garante LS desligado na camada.
      await page.evaluate((key) => localStorage.removeItem(key), l.lsKey);
      await closeAndReopen(page, `?${l.param}=1`);

      const toggle = page.locator('[data-map-controls]').locator(`[${l.attr}]`);
      await expect(toggle).toBeEnabled({ timeout: 15_000 });
      // O deep link liga a camada mesmo sem LS.
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      // E o toggle do utilizador a partir do estado deep-linked persiste.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await closeAndReopen(page);
      const after = page.locator('[data-map-controls]').locator(`[${l.attr}]`);
      await expect(after).toBeEnabled({ timeout: 15_000 });
      await expect(after).toHaveAttribute('aria-pressed', 'false');
    });
  }
});
