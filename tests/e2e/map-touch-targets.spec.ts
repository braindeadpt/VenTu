/**
 * Alvos de toque do mapa — WCAG 2.5.8 (≥44×44 CSS px) + rótulo i18n do botão
 * fullscreen.
 *
 * Audit visual (2026-09) encontrou alvos <44px no mapa: toggle da legenda
 * (105×17 em mobile), rádio "Satélite" do HUD (39px), chips do hero e ✕ do
 * aviso de boias (22×22). Todos corrigidos; este spec impede regressões:
 *
 *  1. Mobile (/pt/mapa/) — toggle da legenda, rádios Mapa/Satélite do HUD,
 *     botão expandir filtros e pills de modalidade ≥44px.
 *  2. Tablet (768×1024, touch) — o mesmo piso aplica-se <lg (chips 44px),
 *     porque tablets são touch mas renderizam o layout "sm+".
 *  3. Desktop (/pt/spots/) — rótulo do botão fullscreen vem do i18n
 *     ("Explorar mapa" / "Explore map"), nunca texto hard-coded.
 *  4. Mobile hero da homepage — chips radar/isóbatas ≥44×44.
 */
import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';

async function expectMinTargetSize(
  locator: ReturnType<import('@playwright/test').Page['locator']>,
  label: string,
) {
  const box = await locator.boundingBox();
  expect(box, `${label} deveria ter caixa mensurável`).not.toBeNull();
  expect(box!.width, `${label} largura`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} altura`).toBeGreaterThanOrEqual(44);
}

async function openMapa(
  page: import('@playwright/test').Page,
  path = '/pt/mapa/',
  extraInit?: (page: import('@playwright/test').Page) => void,
) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  extraInit?.(page);
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

test.describe('Mapa — alvos de toque ≥44px', () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe('mobile /pt/mapa/', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('toggle da legenda: ≥44px e expande ao toque', async ({ page }) => {
      await openMapa(page);

      const legend = page.getByRole('region', { name: 'Legenda do mapa' });
      const toggle = legend.getByRole('button');
      await expectMinTargetSize(toggle, 'toggle da legenda');

      // Por omissão colapsada em mobile; tocar no cabeçalho expande.
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(legend.locator('.h-2')).toBeVisible();
    });

    test('rádios Mapa/Satélite do HUD ≥44px (o "Satélite" tinha 39px)', async ({ page }) => {
      await openMapa(page);

      const radios = page.getByRole('radiogroup', { name: 'Camadas' }).getByRole('radio');
      await expect(radios).toHaveCount(2);
      for (const radio of await radios.all()) {
        await expectMinTargetSize(radio, 'rádio do HUD');
      }
    });

    test('pills de modalidade ≥44px com filtros expandidos', async ({ page }) => {
      await openMapa(page);

      await expandMapHudFilters(page);
      const chips = page.getByRole('group', { name: 'Modalidade' }).getByRole('button');
      await expect(chips.first()).toBeVisible({ timeout: 10_000 });
      for (const chip of await chips.all()) {
        await expectMinTargetSize(chip, 'pill de modalidade');
      }
    });
  });

  test.describe('tablet 768px (touch — layout sm+)', () => {
    test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('toggle da legenda e pills ≥44px abaixo de lg', async ({ page }) => {
      await openMapa(page);

      const legend = page.getByRole('region', { name: 'Legenda do mapa' });
      await expectMinTargetSize(legend.getByRole('button'), 'toggle da legenda (tablet)');

      // As filas de filtros estão visíveis em md+ sem expandir.
      const chips = page.getByRole('group', { name: 'Modalidade' }).getByRole('button');
      await expect(chips.first()).toBeVisible({ timeout: 10_000 });
      for (const chip of await chips.all()) {
        await expectMinTargetSize(chip, 'pill de modalidade (tablet)');
      }
    });
  });

  test.describe('desktop /pt/mapa/ — densidade por modalidade de input (V3′)', () => {
    test.use({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('rato puro (any-pointer: fine): pills mantêm a densidade de 36px', async ({ page }) => {
      await openMapa(page);

      const surf = page.locator('[aria-label="Modalidade"] button').nth(1); // Surf
      await expect(surf).toBeVisible();

      const box = await surf.boundingBox();
      expect(box, 'chip de modalidade deveria ter caixa mensurável').not.toBeNull();
      // Densidade preservada no desktop de rato (decisão V3′ 2026-09): 36px.
      expect(box!.height, 'altura visual (rato)').toBeGreaterThanOrEqual(34);
      expect(box!.height, 'altura visual (rato)').toBeLessThanOrEqual(37);
    });

    test('toque em desktop (any-pointer: coarse): pills sobem ao piso de 44px', async ({ browser }) => {
      // Touch laptop / tablet em paisagem a renderizar o layout lg+: o
      // breakpoint de rato não se aplica — 44px garantidos (piso do projecto).
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
      const page = await ctx.newPage();
      await openMapa(page);

      const surf = page.locator('[aria-label="Modalidade"] button').nth(1); // Surf
      await expect(surf).toBeVisible();
      const box = await surf.boundingBox();
      expect(box, 'chip de modalidade deveria ter caixa mensurável').not.toBeNull();
      expect(box!.height, 'altura (toque em desktop)').toBeGreaterThanOrEqual(44);
      await ctx.close();
    });
  });

  test.describe('desktop /pt/spots/ — rótulo i18n do fullscreen', () => {
    test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('PT mostra "Explorar mapa", EN mostra "Explore map"', async ({ page }) => {
      await openMapa(page, '/pt/spots/');
      await expect(page.getByRole('button', { name: 'Explorar mapa', exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await page.goto('/en/spots/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
      await waitHydrated(page);
      await expect(page.getByRole('button', { name: 'Explore map', exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe('mobile homepage — chips do hero', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('botões radar e isóbatas ≥44×44', async ({ page }) => {
      await preseedWindRingLegend(page);
      await page.goto('/pt/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitHydrated(page);

      const hero = page.getByRole('region', { name: /Mapa interactivo/i });
      await expect(hero).toBeVisible({ timeout: 20_000 });

      const radar = hero.getByRole('button', { name: /Radar/i }).first();
      await expectMinTargetSize(radar, 'chip radar do hero');
      const isobaths = hero.getByRole('button', { name: /isóbatas/i }).first();
      await expectMinTargetSize(isobaths, 'chip isóbatas do hero');
    });
  });
});