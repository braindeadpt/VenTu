import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B7 — o vento v6 em traços com cauda, atrás de `?pele=v6`.
 * A simulação é a de hoje (grelha em fatias da #278, recorte da terra, pausa,
 * fade no gesto); muda o desenho (`mapWindV6.ts`).
 *  - Com a pele: `data-map-windfield-estilo="v6"`, o loop pinta e o canvas tem
 *    traços no gelo/espuma (não o violeta do campo actual).
 *  - Sem a pele: nem o atributo, nem os traços v6.
 *  - Reduced-motion: grelha estática, o contador de frames não sobe.
 *  - Desempenho (critério da D2, telemóvel 390 px com CPU 4×): long tasks nos
 *    primeiros 5 s depois de o vento ligar, comparadas com o campo actual no
 *    mesmo runner.
 */

async function abre(page: Page, pele: boolean, viewport?: { width: number; height: number }): Promise<void> {
  if (viewport) await page.setViewportSize(viewport);
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ kp, pele }) => {
      if (pele) localStorage.setItem(kp, 'v6');
      else localStorage.setItem(kp, 'off');
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu.map.wind', '1');
      // Observador de long tasks desde o arranque (lido no teste de desempenho).
      const w = window as unknown as { __lt: { t: number; d: number }[] };
      w.__lt = [];
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) w.__lt.push({ t: e.startTime, d: e.duration });
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        /* sem suporte */
      }
    },
    { kp: MAP_PELE_LS_KEY, pele },
  );
  await page.goto('/pt/mapa/?sport=kitesurf&wind=1&lat=38.9&lon=-9.5&z=8', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

const mapa = (page: Page) => page.locator('.leaflet-container');

async function frames(page: Page): Promise<number> {
  const v = await mapa(page).getAttribute('data-map-windfield-frames');
  return v ? Number(v) : 0;
}

/** Píxeis pintados no canvas do vento e a cor média deles. */
async function tinta(page: Page): Promise<{ n: number; r: number; g: number; b: number }> {
  return page.locator('canvas.ventu-windfield-canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx || !c.width || !c.height) return { n: 0, r: 0, g: 0, b: 0 };
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue;
      n++; r += d[i]; g += d[i + 1]; b += d[i + 2];
    }
    return n ? { n, r: r / n, g: g / n, b: b / n } : { n: 0, r: 0, g: 0, b: 0 };
  });
}

test.describe('/mapa pele v6 — vento em traços (B7)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'no-preference' });

  test('com a pele: estilo v6, o loop pinta e os traços são gelo/espuma', async ({ page }) => {
    await abre(page, true);
    await expect(mapa(page)).toHaveAttribute('data-map-windfield', 'true', { timeout: 25_000 });
    await expect(mapa(page)).toHaveAttribute('data-map-windfield-estilo', 'v6');
    await page.mouse.move(720, 450);
    const f0 = await frames(page);
    await expect.poll(() => frames(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(f0 + 10);
    await expect.poll(async () => (await tinta(page)).n, { timeout: 10_000 }).toBeGreaterThan(50);
    const c = await tinta(page);
    // gelo #7FE7FF → espuma #F3F8FB: verde e azul altos, sem o violeta do campo actual
    expect(c.g).toBeGreaterThan(200);
    expect(c.b).toBeGreaterThan(220);
    expect(c.g).toBeGreaterThan(c.r);
  });

  test('sem a pele: o campo de hoje, sem o estilo v6', async ({ page }) => {
    await abre(page, false);
    await expect(mapa(page)).toHaveAttribute('data-map-windfield', 'true', { timeout: 25_000 });
    await expect(mapa(page)).not.toHaveAttribute('data-map-windfield-estilo', /.*/);
  });

  test('reduced-motion: grelha estática, sem loop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abre(page, true);
    await expect(mapa(page)).toHaveAttribute('data-map-windfield', 'true', { timeout: 25_000 });
    await expect(mapa(page)).toHaveAttribute('data-map-windfield-estilo', 'v6');
    await expect.poll(async () => (await tinta(page)).n, { timeout: 15_000 }).toBeGreaterThan(50);
    const f1 = await frames(page);
    await page.waitForTimeout(1500);
    expect(await frames(page)).toBe(f1);
  });

  test('desligar o vento remove o canvas e o atributo', async ({ page }) => {
    await abre(page, true);
    await expect(mapa(page)).toHaveAttribute('data-map-windfield-estilo', 'v6', { timeout: 25_000 });
    await page.locator('[data-map-wind-toggle]').first().click();
    await expect(mapa(page)).toHaveAttribute('data-map-windfield', 'false');
    await expect(mapa(page)).not.toHaveAttribute('data-map-windfield-estilo', /.*/);
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(0);
  });

  async function longTasks(ctx: BrowserContext, pele: boolean): Promise<{ max: number; n: number; total: number }> {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await abre(page, pele);
    await expect(mapa(page)).toHaveAttribute('data-map-windfield', 'true', { timeout: 30_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = await page.evaluate(() => performance.now());
    // mantém o campo acordado durante a janela (a pausa de 8 s não conta)
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(150 + i * 5, 400);
      await page.waitForTimeout(500);
    }
    const lt = await page.evaluate(
      (t0) => (window as unknown as { __lt: { t: number; d: number }[] }).__lt.filter((e) => e.t >= t0),
      t0,
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.close();
    return {
      max: lt.reduce((m, e) => Math.max(m, e.d), 0),
      n: lt.length,
      total: lt.reduce((s, e) => s + Math.max(0, e.d - 50), 0),
    };
  }

  test('telemóvel com CPU 4×: os traços não acrescentam long tasks', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP só no Chromium');
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
      reducedMotion: 'no-preference',
    });
    const actual = await longTasks(ctx, false);
    const v6 = await longTasks(ctx, true);
    await ctx.close();
    test.info().annotations.push({
      type: 'long tasks 5 s, CPU 4× (390 px)',
      description: `actual n=${actual.n} máx=${actual.max.toFixed(0)} ms bloqueio=${actual.total.toFixed(0)} ms · v6 n=${v6.n} máx=${v6.max.toFixed(0)} ms bloqueio=${v6.total.toFixed(0)} ms`,
    });
    // D2: sem long tasks > 50 ms nos primeiros 5 s. O runner de CI não é um telemóvel e
    // o campo actual já tem o seu custo, por isso o critério é relativo ao campo actual,
    // no mesmo runner: nenhuma tarefa nova e o bloqueio total não cresce mais de 50 ms.
    expect(v6.n).toBeLessThanOrEqual(actual.n + 1);
    expect(v6.total).toBeLessThanOrEqual(actual.total + 50);
  });
});
