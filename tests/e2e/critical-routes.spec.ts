import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * Pipeline JSON that the client treats as optional (404 → feature off).
 * Gitignored, written by update-conditions; CI's static `out/` export does
 * not include it. Must not trip the prefetch-404 net below.
 */
function isOptionalGeneratedData(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith('/data/map-hours.json');
  } catch {
    return false;
  }
}

/**
 * Fails the test if any SAME-ORIGIN, non-navigation request 404s during page
 * load. This is the regression net for the segment-cache prefetch bug (Next 16
 * wrote RSC payloads as dirs but the router requested dot-joined files — every
 * route prefetch 404'd silently). Scope is deliberate:
 *  - non-navigation: the two intentional-404 tests navigate to missing routes,
 *    whose DOCUMENT request is 404 by design;
 *  - same-origin: map tiles / analytics are cross-origin and must not flake.
 *  - optional generated data: 404 is the documented empty state, not a broken chunk.
 *
 * Returns an assert fn for test.afterEach, so a single broken chunk or RSC
 * payload fails every critical route with the offending URLs listed.
 */
async function attachNoBrokenRequests(page: Page): Promise<() => Promise<void>> {
  const broken404: string[] = [];
  page.on('response', (r) => {
    if (r.status() !== 404) return;
    if (r.request().isNavigationRequest()) return;
    broken404.push(r.url());
  });
  return async () => {
    // Give prefetches/idle-time fetches a beat to land before judging.
    await page.waitForTimeout(1_000);
    const origin = new URL(page.url()).origin;
    const sameOrigin = broken404.filter((u) => {
      const parsed = new URL(u);
      return parsed.origin === origin && !isOptionalGeneratedData(u);
    });
    expect(
      sameOrigin,
      `same-origin 404 during load (asset/prefetch regression):\n${sameOrigin.join('\n') || '(none)'}`,
    ).toEqual([]);
  };
}

test.describe('Critical routes', () => {
  let assertNoBrokenRequests: () => Promise<void>;

  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
    assertNoBrokenRequests = await attachNoBrokenRequests(page);
  });

  test.afterEach(async () => {
    await assertNoBrokenRequests();
  });
  test('homepage PT loads', async ({ page }) => {
    await page.goto('/pt/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(page.getByRole('region', { name: /Mapa interactivo/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('homepage EN loads', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(page.getByRole('region', { name: /Interactive map/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('homepage ES loads', async ({ page }) => {
    await page.goto('/es/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(
      page.getByRole('region', { name: /Mapa interactivo|Interactive map/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('homepage DE loads', async ({ page }) => {
    await page.goto('/de/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(
      page.getByRole('region', { name: /Interaktive Karte|Interactive map|Mapa interactivo/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('homepage FR loads', async ({ page }) => {
    await page.goto('/fr/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(
      page.getByRole('region', {
        name: /Carte interactive|Interactive map|Mapa interactivo|Interaktive Karte/i,
      }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('spot detail page loads', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(page.locator('main')).toContainText(/Guincho/i, { timeout: 15_000 });
  });

  test('spots list with map loads', async ({ page }) => {
    await page.goto('/pt/spots/');
    await expect(page.getByRole('heading', { level: 1, name: /Spots/i })).toBeVisible({ timeout: 15_000 });
  });

  test('compare page loads', async ({ page }) => {
    await page.goto('/pt/compare/');
    await expect(page.getByText('Spot vs Spot')).toBeVisible({ timeout: 15_000 });
  });

  test('favorites page loads', async ({ page }) => {
    await page.goto('/pt/favorites/');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
  });

  test('news archive loads', async ({ page }) => {
    await page.goto('/pt/news/');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
  });

  test('404 is localized PT', async ({ page }) => {
    await page.goto('/pt/spots/spot-que-nao-existe/');
    await expect(page.getByRole('heading', { name: /Página não encontrada/i })).toBeVisible({ timeout: 15_000 });
  });

  test('404 is localized EN', async ({ page }) => {
    await page.goto('/en/spots/spot-that-does-not-exist/');
    await expect(page.getByRole('heading', { name: /Page not found/i })).toBeVisible({ timeout: 15_000 });
  });

  test('search palette opens', async ({ page }) => {
    await page.goto('/pt/');
    await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('big-wave modality filter page loads', async ({ page }) => {
    await page.goto('/pt/modalidades/big-wave/');
    await expect(page.getByRole('heading', { level: 1, name: /Big Wave/i })).toBeVisible({ timeout: 15_000 });
  });

  test('homepage sport filter syncs to URL', async ({ page }) => {
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await hero.getByRole('button', { name: 'Kitesurf', exact: true }).click();
    await expect(page).toHaveURL(/sport=kitesurf/);
    await page.reload();
    await expect(hero.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('mapa page loads fullscreen', async ({ page }) => {
    await page.goto('/pt/mapa/');
    await expect(page.locator('[data-map-fullscreen="true"]')).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveTitle(/Mapa de spots — VenTu/i);
  });

  test('spots map exits fullscreen without freezing the page', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/pt/spots/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });

    const mapShell = page.locator('#explore-map [data-map-fullscreen]');
    await expect(mapShell).toHaveAttribute('data-map-fullscreen', 'false');

    await page.getByRole('button', { name: /Explorar mapa|Explore map/i }).click();
    await expect(mapShell).toHaveAttribute('data-map-fullscreen', 'true', { timeout: 10_000 });

    await page.getByRole('button', { name: /Sair do ecrã inteiro|Exit full screen/i }).click();
    await expect(mapShell).toHaveAttribute('data-map-fullscreen', 'false', { timeout: 10_000 });

    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('');

    const mainOpacity = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      return main ? getComputedStyle(main).opacity : '1';
    });
    expect(Number(mainOpacity)).toBeGreaterThan(0.9);

    await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('admin contributions page loads', async ({ page }) => {
    await page.goto('/pt/admin/contributions/');
    const loginHeading = page.getByRole('heading', { name: /Admin — Contribuições/i });
    const unconfigured = page.getByText(/Supabase não configurado|Supabase is not configured/i);
    await expect(loginHeading.or(unconfigured)).toBeVisible({ timeout: 15_000 });
  });
});
