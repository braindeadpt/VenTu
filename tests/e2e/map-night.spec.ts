import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Estado «noite» do /mapa (#218 D3, opção 1 aprovada): numa frame das 48 h em
 * que o motor v6 não dá nota (map-hours kitesurf/surf = `null`), o marcador
 * fica sem número no fill v6 `noite` (#56677B) e a linha da lista mostra o
 * chip «noite» no lugar da nota. «Todos» (`best`, D5) continua numérico.
 *
 * Stub: o `map-hours.json` da fixture com as séries kitesurf e surf a `null`
 * em TODAS as frames — independente da hora a que o CI corre.
 */
const NIGHT_FILL_RGB = 'rgb(86, 103, 123)'; // #56677B

async function stubNightMapHours(page: Page): Promise<void> {
  await page.route('**/data/map-hours.json', async (route) => {
    const res = await route.fetch();
    const j = (await res.json()) as { spots?: Record<string, Record<string, Array<number | null>>> };
    for (const row of Object.values(j.spots ?? {})) {
      for (const k of ['kitesurf', 'surf']) if (Array.isArray(row[k])) row[k] = row[k].map(() => null);
    }
    await route.fulfill({ response: res, json: j });
  });
}

async function openMapa(page: Page, path: string): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    // Agrupar desligado: todos os spots ficam marcadores completos.
    localStorage.setItem('ventu.map.cluster', '0');
    // Trilho pausado — o frame não avança sozinho.
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
  });
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await expect(page.locator('[data-map-hours="true"]').first()).toBeAttached({ timeout: 20_000 });
}

const nazareMarker = (page: Page) =>
  page.locator('.leaflet-marker-icon.spot-marker[data-spot-id="nazare"]');

test.describe('/mapa — estado «noite» (#218 D3)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('surf numa frame de noite: marcador sem número no fill noite, linha com «noite»', async ({ page }) => {
    await stubNightMapHours(page);
    await openMapa(page, '/pt/mapa/?hours=1&sport=surf');

    // Marcador: data-spot-night, sem data-spot-score, fill #56677B, nome acessível.
    const marker = nazareMarker(page);
    await expect(marker.locator('[data-spot-night="true"]')).toBeAttached({ timeout: 20_000 });
    await expect(marker.locator('[data-spot-score]')).toHaveCount(0);
    await expect(marker).toHaveAttribute('aria-label', 'Nazaré · noite, sem nota');
    const disc = marker.locator('.v3in, [data-v3kind="dot"] i').first();
    expect(await disc.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(NIGHT_FILL_RGB);
    // Sem número no disco.
    expect(((await marker.textContent()) ?? '').trim()).not.toMatch(/\d/);

    // Nenhum marcador de spot com série surf mostra nota nesta frame.
    await expect
      .poll(() => page.locator('.leaflet-marker-icon.spot-marker [data-spot-night]').count(), { timeout: 20_000 })
      .toBeGreaterThan(5);

    // Lista do painel: a linha da Nazaré tem o chip «noite» (role=img, nome acessível).
    const panel = page.locator('[data-map-panel="open"]');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    const row = panel.locator('[role="option"][data-spot-id="nazare"]');
    await row.scrollIntoViewIfNeeded();
    const chip = row.locator('[data-row-night="true"]');
    await expect(chip).toHaveText('noite', { timeout: 15_000 });
    await expect(chip).toHaveAttribute('aria-label', 'noite, sem nota');
    expect(await chip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(NIGHT_FILL_RGB);

    // As linhas de noite ficam depois das que têm nota (nunca no topo com outra nota abaixo).
    const kinds = await panel
      .locator('[role="listbox"] [role="option"]')
      .evaluateAll((els) => els.map((r) => (r.querySelector('[data-row-night]') ? 'n' : 's')).join(''));
    expect(kinds).toMatch(/^s*n*$/);
  });

  test('pré-visualização do spot de noite: «noite» no lugar da nota', async ({ page }) => {
    await stubNightMapHours(page);
    await openMapa(page, '/pt/mapa/?hours=1&sport=surf');
    const marker = nazareMarker(page);
    await expect(marker.locator('[data-spot-night="true"]')).toBeAttached({ timeout: 20_000 });
    await marker.click();
    const card = page.locator('[data-card-night="true"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveText('noite');
    await expect(card).toHaveAttribute('aria-label', 'noite, sem nota');
    await expect(page.locator('[data-card-score]')).toHaveCount(0);
  });

  test('EN, kitesurf: «night» / «night, no score»', async ({ page }) => {
    await stubNightMapHours(page);
    await openMapa(page, '/en/mapa/?hours=1&sport=kitesurf');
    const marker = page.locator('.leaflet-marker-icon.spot-marker[data-spot-id="guincho"]');
    await expect(marker.locator('[data-spot-night="true"]')).toBeAttached({ timeout: 20_000 });
    await expect(marker).toHaveAttribute('aria-label', /· night, no score$/);
    const row = page.locator('[data-map-panel="open"] [role="option"][data-spot-id="guincho"]');
    await row.scrollIntoViewIfNeeded();
    await expect(row.locator('[data-row-night="true"]')).toHaveText('night', { timeout: 15_000 });
  });

  test('«Todos» (best, D5): continua numérico — nenhum marcador de noite', async ({ page }) => {
    await stubNightMapHours(page);
    await openMapa(page, '/pt/mapa/?hours=1&sport=all');
    await expect(nazareMarker(page).locator('[data-spot-score]')).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('.leaflet-marker-icon.spot-marker [data-spot-night]')).toHaveCount(0);
    await expect(page.locator('[data-row-night]')).toHaveCount(0);
  });
});
