import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { interceptMapHours, interceptRadar } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expectTopmostHit } from './helpers/hit-test';
import { expandMapHudFilters } from './helpers/map-hud';

/**
 * Audit mobile do strip de camadas do HUD do /mapa: cada toggle tem de ser
 * alcançável (rolável para a vista e elemento de topo no seu centro — nada a
 * cobri-lo) e o estado tem de persistir entre recargas.
 *
 * Persistência real verificada em auditoria: correntes → ventu.map.currents,
 * SST → ventu.map.sst, isóbatas → ventu.map.isobaths, radar → ventu.radar.state.
 * O HS↔SST são mutuamente exclusivos por design (um desliga o outro); o teste
 * toca apenas um de cada vez a partir do estado inicial desligado.
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

/** Fixture com correntes + SST → os toggles nascem disponíveis (não disabled). */
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
  sst: {
    nazare: series({}),
  },
};

const RADAR_STUB = {
  source: 'ipma-radar',
  fetchedAt: '2026-08-15T01:05:00.000Z',
  frameTime: '2026-08-15T01:00:00.000Z',
  framePath: 'pcr-2026-08-15T0100.png',
  imagePath: 'radar/ipma-radar.png',
  frames: [
    {
      frameTime: '2026-08-15T01:00:00.000Z',
      framePath: 'pcr-2026-08-15T0100.png',
      imagePath: 'radar/frames/pcr-2026-08-15T0100.png',
    },
  ],
  bounds: { south: 34.011513, west: -12.454795, north: 43.792862, east: -4.345465 },
  attribution: 'IPMA',
};

async function openMapaMobile(page: Page): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await interceptRadar(page, RADAR_STUB);
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await expandMapHudFilters(page);
}

const TOGGLES = [
  {
    name: 'correntes',
    attr: 'data-map-currents-toggle',
    lsKey: 'ventu.map.currents',
    lsValue: '1',
  },
  { name: 'temperatura (SST)', attr: 'data-map-sst-toggle', lsKey: 'ventu.map.sst', lsValue: '1' },
  {
    name: 'isóbatas',
    attr: 'data-map-isobaths-toggle',
    lsKey: 'ventu.map.isobaths',
    lsValue: '1',
  },
  { name: 'radar IPMA', attr: 'data-map-radar-toggle', lsKey: 'ventu.radar.state', lsValue: null },
];

test.describe('Mapa mobile — toggles de camadas: alcançáveis e persistentes', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  test.describe.configure({ timeout: 60_000 });

  for (const t of TOGGLES) {
    test(`toggle «${t.name}» é o elemento de topo no strip e persiste após recarga`, async ({
      page,
    }) => {
      await openMapaMobile(page);

      const toggle = page.locator(`[${t.attr}]`);
      await expect(toggle).toBeEnabled({ timeout: 15_000 });
      // O strip rola horizontalmente (overflow-x-auto) — um utilizador rola até
      // ao controlo; só depois é que tem de ser o elemento de topo.
      await toggle.scrollIntoViewIfNeeded();
      await expectTopmostHit(page, toggle);

      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');

      // A preferência tem de estar escrita em localStorage no momento do toggle.
      const stored = await page.evaluate((key) => localStorage.getItem(key), t.lsKey);
      if (t.lsValue === null) {
        expect(stored, `${t.lsKey} escrito`).toBeTruthy();
      } else {
        expect(stored, `${t.lsKey} = ${t.lsValue}`).toBe(t.lsValue);
      }

      // Recarga com o mesmo contexto (localStorage preservado) → estado reposto.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
      await waitHydrated(page);
      await expandMapHudFilters(page);

      const after = page.locator(`[${t.attr}]`);
      await expect(after).toBeEnabled({ timeout: 15_000 });
      await expect(after).toHaveAttribute('aria-pressed', 'true');
    });
  }
});