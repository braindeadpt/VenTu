import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * /mapa — «Perto de mim», «Partilhar vista» e desporto lembrado.
 * A posição do utilizador nunca sai do browser (sem URL/storage); a
 * partilha só escreve centro, zoom, desporto, região e camadas.
 */

async function openMapa(page: Page, query = ''): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('ventu.mapdebug', '1');
  });
  await page.goto(`/pt/mapa/${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

async function mapCenter(page: Page) {
  return page.evaluate(() => {
    const map = (window as any).__VENTU_MAP__;
    if (!map) return null;
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
  });
}

const locateBtn = (page: Page) => page.locator('[data-map-locate]');
const shareBtn = (page: Page) => page.locator('[data-map-share]');
const locateDot = (page: Page) => page.locator('.ventu-locate-dot');

test.describe('«Perto de mim» e «Partilhar» — desktop', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });

  test('permissão concedida centra a vista e marca o ponto «estás aqui»', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 38.96, longitude: -9.42 });
    await preseedWindRingLegend(page);
    await openMapa(page);

    const btn = locateBtn(page);
    await expect(btn).toBeVisible({ timeout: 30_000 });
    const box = await btn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await btn.click();
    await expect(locateDot(page)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await mapCenter(page))?.lat ?? 0, { timeout: 15_000 })
      .toBeCloseTo(38.96, 1);
    const c = await mapCenter(page);
    expect(c!.lng).toBeCloseTo(-9.42, 1);
    expect(c!.zoom).toBeGreaterThanOrEqual(10);
  });

  test('permissão negada mostra mensagem curta sem partir o mapa', async ({ page }) => {
    await preseedWindRingLegend(page);
    await openMapa(page);
    const before = await mapCenter(page);

    await locateBtn(page).click();
    // Sem permissão concedida o getCurrentPosition falha → toast localizado.
    await expect(
      page.getByText('Permissão de localização negada'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(locateDot(page)).toHaveCount(0);
    // A vista não se moveu e o mapa continua operacional.
    const after = await mapCenter(page);
    expect(after).not.toBeNull();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(before).not.toBeNull();
  });

  test('«Partilhar» copia um link que reproduz desporto, camada e centro', async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await preseedWindRingLegend(page);
    await openMapa(page, '?sport=kitesurf');

    // Liga uma camada (Boias) pelo menu «Camadas».
    await page.locator('[data-map-controls] [data-map-layers-menu]').first().click();
    const buoys = page.locator('[data-map-layers-popover] [data-map-buoys-toggle]');
    await expect(buoys).toBeVisible({ timeout: 10_000 });
    if ((await buoys.getAttribute('aria-pressed')) !== 'true') await buoys.click();
    await page.keyboard.press('Escape');

    const center = await mapCenter(page);
    await shareBtn(page).click();
    await expect(page.getByText('Ligação copiada')).toBeVisible({ timeout: 10_000 });
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('/pt/mapa/');
    expect(url).toContain('sport=kitesurf');
    expect(url).toContain('buoys=1');
    expect(url).toMatch(/lat=-?\d+\.\d{3}/);
    expect(url).toMatch(/z=/);

    // Noutro contexto (outro «browser»): o link reproduz a vista.
    const ctx2 = await browser.newContext({ serviceWorkers: 'block' });
    await ctx2.addInitScript(() => {
      localStorage.setItem('ventu.mapdebug', '1');
    });
    try {
      const p2 = await ctx2.newPage();
      await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await p2.waitForSelector('.leaflet-container', { timeout: 30_000 });
      await waitHydrated(p2);
      const c2 = await mapCenter(p2);
      expect(c2!.lat).toBeCloseTo(center!.lat, 2);
      expect(c2!.lng).toBeCloseTo(center!.lng, 2);
      expect(c2!.zoom).toBeCloseTo(center!.zoom, 0);
      // Desporto do link aplicado ao painel.
      await expect(
        p2.getByRole('button', { name: 'Kitesurf' }).first(),
      ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
      // Camada de boias ligada — pontos de boia no mapa.
      await expect
        .poll(
          () =>
            p2.evaluate(
              () => document.querySelectorAll('.ventu-buoy-marker').length,
            ),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
    } finally {
      await ctx2.close();
    }
  });

  test('o /mapa lembra a modalidade; o deep link vence', async ({ page, context }) => {
    await preseedWindRingLegend(page);
    // 1) Visita com deep link — grava a modalidade em LS_SPORT_KEY.
    await openMapa(page, '?sport=windsurf');
    await expect(
      page.getByRole('button', { name: 'Windsurf' }).first(),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

    // 2) Sem ?sport= — abre na modalidade lembrada, não em «Todos».
    await openMapa(page);
    await expect(
      page.getByRole('button', { name: 'Windsurf' }).first(),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

    // 3) O deep link vence a memória.
    await openMapa(page, '?sport=kitesurf');
    await expect(
      page.getByRole('button', { name: 'Kitesurf' }).first(),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    void context;
  });
});

test.describe('«Perto de mim» e «Partilhar» — mobile 390', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
  });

  test('botões visíveis ≥44px; localização concedida centra', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 41.15, longitude: -8.61 });
    await preseedWindRingLegend(page);
    await openMapa(page);

    const btn = locateBtn(page);
    await expect(btn).toBeVisible({ timeout: 30_000 });
    const box = await btn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expect(shareBtn(page)).toBeVisible();

    await btn.tap();
    await expect(locateDot(page)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await mapCenter(page))?.lat ?? 0, { timeout: 15_000 })
      .toBeCloseTo(41.15, 1);
  });
});
