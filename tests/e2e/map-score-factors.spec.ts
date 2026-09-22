import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * «Porquê este score» — a gramática canónica de factores (src/lib/spotScoreFactors)
 * tem de ser a MESMA nas três superfícies do mapa:
 *   popup (desktop 1440) ≡ sheet de detalhe (mobile 390) ≡ linha da lista.
 * O atributo data-score-factors carrega as etiquetas completas — o texto
 * visível da lista é a versão curta dos mesmos factores.
 */

async function openMapa(page: Page, locale: 'pt' | 'en'): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto(`/${locale}/mapa/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

/** Marcador clicável: in-viewport e com o centro descoberto (não tapado por HUD/painel). */
async function pickClickableMarker(page: Page): Promise<number> {
  const pick = await page.waitForFunction(
    () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const markers = Array.from(
        document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
      );
      for (let i = 0; i < markers.length; i += 1) {
        const m = markers[i];
        const r = m.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && (top === m || m.contains(top))) return { index: i };
      }
      return null;
    },
    { timeout: 30_000, polling: 250 },
  );
  const { index } = await pick.jsonValue();
  if (index === undefined || index < 0) throw new Error('sem marcador clicável');
  return index;
}

test.describe('Factores do score — gramática partilhada (desktop)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });

  test('popup e linha da lista mostram os mesmos factores (PT)', async ({ page }) => {
    await openMapa(page, 'pt');
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
    const index = await pickClickableMarker(page);
    await page.locator('.leaflet-marker-icon.spot-marker').nth(index).click({ force: true });

    const factorsEl = page.locator('.spot-popup [data-score-factors]');
    await expect(factorsEl).toBeVisible({ timeout: 15_000 });
    const popupFactors = await factorsEl.getAttribute('data-score-factors');
    expect(popupFactors).toBeTruthy();

    const spotId = await page.locator('.ventu-popup-detail').first().getAttribute('data-spot-id');
    expect(spotId).toBeTruthy();

    const rowFactors = page.locator(`[role="listbox"] [data-spot-id="${spotId}"] [data-score-factors]`);
    await expect(rowFactors).toBeVisible({ timeout: 15_000 });
    expect(await rowFactors.getAttribute('data-score-factors')).toBe(popupFactors);
  });

  test('popup and list row show the same factors (EN)', async ({ page }) => {
    await openMapa(page, 'en');
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
    const index = await pickClickableMarker(page);
    await page.locator('.leaflet-marker-icon.spot-marker').nth(index).click({ force: true });

    const factorsEl = page.locator('.spot-popup [data-score-factors]');
    await expect(factorsEl).toBeVisible({ timeout: 15_000 });
    const popupFactors = await factorsEl.getAttribute('data-score-factors');
    expect(popupFactors).toBeTruthy();

    const spotId = await page.locator('.ventu-popup-detail').first().getAttribute('data-spot-id');
    const rowFactors = page.locator(`[role="listbox"] [data-spot-id="${spotId}"] [data-score-factors]`);
    await expect(rowFactors).toBeVisible({ timeout: 15_000 });
    expect(await rowFactors.getAttribute('data-score-factors')).toBe(popupFactors);
  });
});

test.describe('Factores do score — gramática partilhada (mobile)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
  });

  test('sheet de detalhe e linha da lista mostram os mesmos factores (PT)', async ({ page }) => {
    await openMapa(page, 'pt');
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    // Sheet explorar → aberto (lista) para tocar numa linha.
    await page.locator('[data-sheet-grabber]').click(); // peek → half
    await page.locator('[data-sheet-grabber]').click(); // half → open
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open', { timeout: 15_000 });

    const row = page.locator('[role="listbox"] [data-spot-id]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const rowFactors = row.locator('[data-score-factors]');
    const expected = await rowFactors.getAttribute('data-score-factors');
    expect(expected).toBeTruthy();

    // Toque na linha → sheet de detalhe com o MESMO spot e desporto.
    await row.click();
    const detail = page.locator('[data-testid="map-spot-sheet"] [data-score-factors]');
    await expect(detail).toBeVisible({ timeout: 15_000 });
    expect(await detail.getAttribute('data-score-factors')).toBe(expected);
  });
});
