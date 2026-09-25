import { test, expect } from '@playwright/test';
import { openMapSpotSheet } from './helpers/map-sheet';
import { preseedWindRingLegend } from './helpers/map-setup';

test.describe('Forecast confidence badge', () => {
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
  });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('map sheet shows accessible confidence status', async ({ page }) => {
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
    const sheet = await openMapSpotSheet(page);
    await expect(
      sheet.getByRole('status', { name: /Confiança da previsão/i }),
    ).toBeVisible();
  });

  test('spot «Como sabemos» shows confidence status', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    // v3: o badge de confiança vive só na §7 — em mobile a secção é um
    // accordion fechado por defeito; abre-o antes de verificar. O accordion
    // só existe depois de montar (collapsible={isMobile}, isMobile vem de um
    // efeito): o HTML do build tem a secção aberta e sem <summary>. Contar
    // o summary logo a seguir ao H1 dava 0 às vezes, o clique era saltado e
    // a secção fechava a seguir — falhava ~1 em 5. A 390 px o accordion
    // aparece sempre: espera por ele.
    const summary = page.locator('#como-sabemos summary');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await summary.click();
    await expect(
      page.getByRole('status', { name: /Confiança da previsão/i }).first(),
    ).toBeVisible();
  });
});
