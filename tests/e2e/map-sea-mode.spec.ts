import { test, expect, type Page } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { encodeSeaGrid } from '../../scripts/lib/seaGrid.js';

/**
 * Selector «Vento | Ondulação | Nenhum» do /mapa (maquete aprovada):
 * sempre visível no topo-centro (desktop e mobile), radiogroup acessível por
 * teclado, camadas mutuamente exclusivas, URL/partilha/pref, legenda segue a
 * escolha. A grelha do mar é servida por um stub FRESCO (o sea-grid.json
 * commitado envelhece e o cliente rejeita > 30 h).
 */


function seaGridStub() {
  const boxes = [
    { id: 'mainland', west: -11, south: 36, nx: 9, ny: 13, step: 0.5 },
    { id: 'atlantic', west: -34.5, south: 26.5, nx: 35, ny: 21, step: 1 },
  ];
  const nodes: Array<{ lat: number; lon: number; fetch: boolean; store: boolean }> = [];
  for (const b of boxes) {
    for (let j = 0; j < b.ny; j++) {
      for (let i = 0; i < b.nx; i++) nodes.push({ lat: b.south + j * b.step, lon: b.west + i * b.step, fetch: true, store: true });
    }
  }
  const nowH = Math.floor(Date.now() / 3600_000) * 3600;
  const times = Array.from({ length: 56 }, (_, k) => nowH - 3600 + k * 3600);
  const idx = times.map((_, k) => k);
  const wind = nodes.map(() => ({ wind_speed_10m: times.map(() => 8), wind_direction_10m: times.map(() => 0) }));
  const marine = nodes.map((n) => ({
    wave_height: times.map(() => 1 + (n.lat - 26) / 10),
    swell_wave_direction: times.map(() => 300),
    swell_wave_period: times.map(() => 12),
  }));
  return encodeSeaGrid({ boxes, nodes, wind, marine, times, idx, generatedAt: new Date().toISOString(), source: 'e2e' });
}

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
  wind: { nazare: { spd: TIMES.map(() => 6), dir: TIMES.map(() => 0) } },
};

async function openMapa(page: Page, query = '', storage: Record<string, string> = {}) {
  await preseedWindRingLegend(page);
  await page.addInitScript((kv) => {
    localStorage.setItem('ventu.map.cluster', '0');
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, storage);
  await interceptMapHours(page, MAP_HOURS_STUB);
  const grid = JSON.stringify(seaGridStub());
  await page.route('**/data/sea-grid.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: grid }),
  );
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

const group = (page: Page) => page.getByRole('radiogroup', { name: 'Camada sobre o mar' });
const radio = (page: Page, name: 'Vento' | 'Ondulação' | 'Nenhum') => group(page).getByRole('radio', { name });

for (const vp of [
  { label: 'desktop 1440', width: 1440, height: 900 },
  { label: 'mobile 390', width: 390, height: 844 },
]) {
  test.describe(`Selector Vento | Ondulação | Nenhum — ${vp.label}`, () => {
    test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: vp.width, height: vp.height } });
    test.describe.configure({ timeout: 90_000 });

    test('visível no topo-centro, dentro do ecrã e sem tapar a pilha nem a pill', async ({ page }) => {
      await openMapa(page, '?wind=1');
      const g = group(page);
      await expect(g).toBeVisible({ timeout: 15_000 });
      const box = (await g.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      // Topo-centro da faixa LIVRE do mapa: sem painel, o centro do ecrã; com
      // o painel «Explorar» aberto (desktop ≥ 768), o selector e a pill
      // centram-se à direita dele (globals.css, --map-panel-offset) — um
      // centro absoluto ficava por baixo do painel. Mede contra o painel real.
      const panel = page.locator('[data-map-panel="open"]').filter({ visible: true }).first();
      const panelBox = (await panel.count()) ? await panel.boundingBox() : null;
      const freeLeft = panelBox ? panelBox.x + panelBox.width : 0;
      expect(box.x).toBeGreaterThanOrEqual(freeLeft);
      const pill = await page.locator('[data-map-time-pill]').boundingBox();
      if (pill) {
        // Selector e pill partilham o mesmo eixo vertical.
        expect(Math.abs(box.x + box.width / 2 - (pill.x + pill.width / 2))).toBeLessThan(4);
        expect(pill.y).toBeGreaterThanOrEqual(box.y + box.height);
      }
      if (!panelBox) expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(4);
      const stack = await page.locator('[data-map-control-stack]').boundingBox();
      if (stack) expect(box.x + box.width).toBeLessThanOrEqual(stack.x);
      for (const name of ['Vento', 'Ondulação', 'Nenhum'] as const) {
        const r = (await radio(page, name).boundingBox())!;
        expect(r.height).toBeGreaterThanOrEqual(36);
      }
    });

    test('exclusivo: Ondulação desliga o vento e vice-versa; Nenhum desliga os dois', async ({ page }) => {
      await openMapa(page, '?wind=1');
      // `data-map-swell` vive no .leaflet-container (useMapSwellField);
      // `data-map-wind` é espelho do shell `[data-map-fullscreen]`, como
      // data-map-cluster/hs/sst — lê-se cada um no seu dono.
      const map = page.locator('.leaflet-container');
      const shell = page.locator('[data-map-fullscreen]');
      await expect(radio(page, 'Vento')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
      await expect(shell).toHaveAttribute('data-map-wind', 'true');

      await radio(page, 'Ondulação').click();
      await expect(radio(page, 'Ondulação')).toHaveAttribute('aria-checked', 'true');
      await expect(shell).toHaveAttribute('data-map-wind', 'false');
      await expect(map).toHaveAttribute('data-map-swell', 'true', { timeout: 15_000 });
      await expect.poll(() => new URL(page.url()).searchParams.get('swell')).toBe('1');

      await radio(page, 'Vento').click();
      await expect(shell).toHaveAttribute('data-map-wind', 'true');
      await expect(map).toHaveAttribute('data-map-swell', 'false', { timeout: 15_000 });
      await expect.poll(() => new URL(page.url()).searchParams.get('swell')).toBeNull();

      await radio(page, 'Nenhum').click();
      await expect(shell).toHaveAttribute('data-map-wind', 'false');
      await expect(map).toHaveAttribute('data-map-swell', 'false');
      await expect.poll(() => new URL(page.url()).searchParams.get('wind')).toBe('0');
      expect(await page.evaluate(() => localStorage.getItem('ventu.map.wind'))).toBe('0');
      expect(await page.evaluate(() => localStorage.getItem('ventu.map.swell'))).toBe('0');
    });
  });
}

test.describe('Selector — teclado, deep links e legenda', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  test.describe.configure({ timeout: 90_000 });

  test('setas mudam a escolha e o foco (tabindex itinerante)', async ({ page }) => {
    await openMapa(page, '?wind=1');
    await expect(radio(page, 'Vento')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
    await radio(page, 'Vento').focus();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'Ondulação')).toBeFocused();
    await expect(radio(page, 'Ondulação')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(radio(page, 'Nenhum')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'Vento')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, 'Vento')).toHaveAttribute('tabindex', '0');
    await expect(radio(page, 'Nenhum')).toHaveAttribute('tabindex', '-1');
  });

  test('?swell=1 vence a pref de vento; ?wind=0 abre em «Nenhum»', async ({ page }) => {
    await openMapa(page, '?swell=1', { 'ventu.map.wind': '1' });
    await expect(radio(page, 'Ondulação')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
    await expect(page.locator('[data-map-fullscreen]')).toHaveAttribute('data-map-wind', 'false');

    await page.goto('/pt/mapa/?wind=0', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(() => localStorage.setItem('ventu.map.wind', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(radio(page, 'Nenhum')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
  });

  test('a legenda segue a escolha', async ({ page }) => {
    await openMapa(page, '?wind=1', { 'ventu.map.legend': '1' });
    const legend = page.locator('[data-map-legend-card]');
    await expect(radio(page, 'Vento')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
    await expect(legend).toContainText('nós', { timeout: 15_000 });
    await radio(page, 'Ondulação').click();
    await expect(legend).toContainText('Ondulação · Hs (m)', { timeout: 15_000 });
    await radio(page, 'Nenhum').click();
    await expect(legend).not.toContainText('Ondulação · Hs (m)');
  });
});
