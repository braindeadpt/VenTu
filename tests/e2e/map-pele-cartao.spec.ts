import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptMapHours } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B4 — cartão (desktop) e folha (390) do spot na pele v6:
 * nota /10 no tile da banda, noite com a lua em #56677B e a próxima janela ≥ 7
 * das 48 h. Sem a pele, o cartão de hoje (320 px), sem um único `data-ms`.
 */

// 16 passos de 3 h ancorados em Lisboa (o mesmo desenho do harness de paridade).
const lisboa = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  })
    .formatToParts(new Date())
    .filter((x) => x.type !== 'literal')
    .map((x) => [x.type, x.value]),
);
const diaLisboa = (desvio: number) =>
  new Date(Date.UTC(Number(lisboa.year), Number(lisboa.month) - 1, Number(lisboa.day) + desvio))
    .toISOString()
    .slice(0, 10);
const horaAgora = Number(lisboa.hour) % 24;
const recua = (horaAgora - 2 + 24) % 3;
const TIMES_48H = Array.from({ length: 16 }, (_, i) => {
  const total = horaAgora - recua + i * 3;
  const dia = Math.floor(total / 24);
  return `${diaLisboa(dia)}T${String(((total % 24) + 24) % 24).padStart(2, '0')}:00`;
});
/** Guincho: kitesurf 6/10, o 4.º passo de noite (`null`) e a 1.ª janela ≥ 7 no 7.º passo (8/10). */
const KITE = TIMES_48H.map((_, i) => (i === 3 ? null : i === 6 ? 80 : 60));
const HOURS_STUB = {
  generatedAt: new Date().toISOString(),
  stepHours: 3,
  times: TIMES_48H,
  sports: ['surf', 'kitesurf'],
  spots: { guincho: { best: KITE, surf: KITE, kitesurf: KITE } },
};

async function abre(page: Page, on: boolean, frame = 0): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ key, on, frame }) => {
      if (on) localStorage.setItem(key, 'v6');
      else localStorage.removeItem(key);
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame }));
    },
    { key: MAP_PELE_LS_KEY, on, frame },
  );
  await interceptMapHours(page, HOURS_STUB);
  await page.goto('/pt/mapa/?sport=kitesurf&hours=1&spot=guincho', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

test.describe('/mapa pele v6 — cartão do spot (B4), desktop', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('nota /10 no tile da banda, 356 px, CTA ≥ 44 px', async ({ page }) => {
    await abre(page, true);
    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute('data-ms', 'cartao');
    expect((await card.boundingBox())?.width).toBe(356);
    const nota = card.locator('[data-ms="nota"]');
    await expect(nota).toHaveAttribute('data-tier', 'fair');
    await expect(nota).toContainText('6');
    await expect(nota).toContainText('/10');
    expect(await nota.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(201, 158, 42)');
    const sol = card.locator('[data-ms="b-sol"]');
    expect((await sol.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(card.locator('[data-ms="m48"] > i')).toHaveCount(16, { timeout: 15_000 });
  });

  test('de noite: lua em #56677B e a próxima janela ≥ 7', async ({ page }) => {
    await abre(page, true, 3);
    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const nota = card.locator('[data-ms="nota"][data-noite]');
    await expect(nota).toHaveAttribute('data-card-night', 'true');
    expect(await nota.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(86, 103, 123)');
    await expect(card.locator('[data-janela]')).toContainText('Próxima janela');
    await expect(card.locator('[data-janela]')).toContainText('8/10');
    await expect(card.locator('[data-janela]')).toHaveAttribute('data-janela', TIMES_48H[6]);
  });

  test('sem a pele: o cartão de hoje, 320 px e sem data-ms', async ({ page }) => {
    await abre(page, false);
    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    expect((await card.boundingBox())?.width).toBe(320);
    await expect(page.locator('[data-ms]')).toHaveCount(0);
  });
});

test.describe('/mapa pele v6 — folha do spot (B4), 390', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('a folha veste a pele e mostra a mesma nota', async ({ page }) => {
    await abre(page, true);
    const sheet = page.locator('[data-testid="map-spot-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet).toHaveAttribute('data-ms', 'folha');
    await expect(sheet.locator('[data-ms="nota"]')).toHaveAttribute('data-tier', 'fair');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('sem a pele: a folha de hoje, sem data-ms', async ({ page }) => {
    await abre(page, false);
    await expect(page.locator('[data-testid="map-spot-sheet"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-ms]')).toHaveCount(0);
  });
});
