import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_BASE_LS_KEY, MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B6 (decisão D1) — recolor da base «Mapa» com o filtro SVG
 * `#v6base`, atrás de `?pele=v6&pelebase=v6`.
 *  - Com as duas flags: a base é o Esri Dark Gray com a classe `ventu-base-v6` e
 *    `filter:url(#v6base)`; no Satélite não há classe nem filtro.
 *  - Só com a pele (sem `pelebase`): nem classe, nem <svg>, nem `data-pele-base`.
 *  - Fluidez (aceitação (b) da D1): pan com CPU 4×, p95 do intervalo entre frames
 *    com o filtro comparado com a mesma base sem filtro, no mesmo runner.
 * Os mosaicos são servidos localmente (um PNG de 1 px, como no visual-regression):
 * o custo do filtro é por píxel composto, não depende do conteúdo do mosaico.
 */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function abre(page: Page, flags: { pele: boolean; base: boolean }, basemap: 'map' | 'satellite' = 'map'): Promise<void> {
  await preseedWindRingLegend(page);
  await page.route(/basemaps\.cartocdn\.com|server\.arcgisonline\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }),
  );
  await page.addInitScript(
    ({ kp, kb, f, basemap }) => {
      if (f.pele) localStorage.setItem(kp, 'v6');
      else localStorage.setItem(kp, 'off');
      if (f.base) localStorage.setItem(kb, 'v6');
      else localStorage.removeItem(kb);
      localStorage.setItem('ventu.map.basemap', basemap);
      localStorage.setItem('ventu.map.cluster', '0');
    },
    { kp: MAP_PELE_LS_KEY, kb: MAP_PELE_BASE_LS_KEY, f: flags, basemap },
  );
  await page.goto('/pt/mapa/?sport=surf&lat=38.73&lon=-9.47&z=10', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await expect(page.locator('.leaflet-container')).toHaveAttribute('data-map-tiles', 'ok', { timeout: 25_000 });
}

const filtroDaBase = (page: Page) =>
  page.locator('.leaflet-tile-pane > .leaflet-layer').first().evaluate((el) => getComputedStyle(el).filter);

async function p95Pan(ctx: BrowserContext, flags: { pele: boolean; base: boolean }): Promise<number> {
  const page = await ctx.newPage();
  await abre(page, flags);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const box = (await page.locator('.leaflet-container').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(() => {
    const w = window as unknown as { __fr: number[]; __on: boolean };
    w.__fr = [];
    w.__on = true;
    let t0 = performance.now();
    const tick = (t: number) => {
      w.__fr.push(t - t0);
      t0 = t;
      if (w.__on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let volta = 0; volta < 3; volta++) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 300, cy - 120, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
  const fr = await page.evaluate(() => {
    const w = window as unknown as { __fr: number[]; __on: boolean };
    w.__on = false;
    return w.__fr.slice(2);
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  const s = [...fr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

test.describe('/mapa pele v6 — base «Mapa» recolorida (B6)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('com as duas flags: Esri Dark Gray com o filtro #v6base', async ({ page }) => {
    const pedidos: string[] = [];
    page.on('request', (r) => {
      if (/server\.arcgisonline\.com|basemaps\.cartocdn\.com/.test(r.url())) pedidos.push(r.url());
    });
    await abre(page, { pele: true, base: true });
    await expect(page.locator('[data-pele="v6"]')).toHaveAttribute('data-pele-base', 'v6');
    await expect(page.locator('filter#v6base feComponentTransfer > feFuncR')).toHaveCount(1);
    await expect(page.locator('.ventu-base-v6')).toHaveCount(1);
    expect(await filtroDaBase(page)).toContain('#v6base');
    expect(pedidos.some((u) => u.includes('World_Dark_Gray_Base'))).toBe(true);
    expect(pedidos.some((u) => u.includes('dark_nolabels'))).toBe(false);
  });

  test('no Satélite: nem classe nem filtro', async ({ page }) => {
    await abre(page, { pele: true, base: true }, 'satellite');
    await expect(page.locator('.leaflet-container')).toHaveAttribute('data-basemap', 'satellite');
    await expect(page.locator('.ventu-base-v6')).toHaveCount(0);
    expect(await filtroDaBase(page)).toBe('none');
  });

  test('só a pele, sem pelebase: a base de hoje, sem <svg> nem atributo', async ({ page }) => {
    await abre(page, { pele: true, base: false });
    await expect(page.locator('[data-pele="v6"]')).not.toHaveAttribute('data-pele-base', /.*/);
    await expect(page.locator('#v6base')).toHaveCount(0);
    await expect(page.locator('.ventu-base-v6')).toHaveCount(0);
    expect(await filtroDaBase(page)).toBe('none');
  });

  test('sem pele, pelebase sozinha não faz nada', async ({ page }) => {
    await abre(page, { pele: false, base: true });
    await expect(page.locator('[data-pele-base]')).toHaveCount(0);
    await expect(page.locator('.ventu-base-v6')).toHaveCount(0);
  });

  test('fluidez do pan com CPU 4×: o filtro não piora o p95 dos frames', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP só no Chromium');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    // Referência: a mesma base Esri sem filtro não existe atrás de flag; usa-se a base
    // de hoje (pele sem pelebase). As duas medições correm no mesmo runner, em sequência.
    const semFiltro = await p95Pan(ctx, { pele: true, base: false });
    const comFiltro = await p95Pan(ctx, { pele: true, base: true });
    await ctx.close();
    test.info().annotations.push({ type: 'p95 frame (ms)', description: `sem filtro ${semFiltro.toFixed(1)} · com filtro ${comFiltro.toFixed(1)}` });
    // D1: p95 ≤ 20 ms contra a base actual. No runner de CI (sem GPU) o valor absoluto
    // não é o de um telemóvel, por isso o critério é relativo, com folga de 4 ms.
    expect(comFiltro).toBeLessThanOrEqual(Math.max(20, semFiltro * 1.25 + 4));
  });
});
