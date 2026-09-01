import { test, expect } from '@playwright/test';
import { interceptData } from './helpers/conditions';

/**
 * Gear calculators (ferramentas/calculadora-kite + calculadora-fato).
 *
 * Plays the first-time-user flow: load, move the sliders, pick a live spot,
 * hit the edges (zero wind, extreme values), and assert the ACTUAL computed
 * outputs (suit thickness, kite m², comfort window) — not just that the page
 * renders. Both desktop and a 390px mobile viewport.
 *
 * The calculators optionally prefill from /data/conditions.json when a spot
 * is selected (useSpotConditions). We intercept that file so the live-data
 * path is hermetic.
 */

const KITE_URL = '/pt/ferramentas/calculadora-kite/';
const FATO_URL = '/pt/ferramentas/calculadora-fato/';

const EMPTY_CONDITIONS = {};

test.use({ serviceWorkers: 'block' });

test.describe('kite calculator', () => {
  test.beforeEach(async ({ page }) => {
    await interceptData(page, 'conditions.json', EMPTY_CONDITIONS);
  });

  test('desktop: realistic inputs → correct kite size and comfort window', async ({ page }) => {
    await page.goto(KITE_URL, { waitUntil: 'networkidle' });

    // Defaults: 75 kg, 18 kt, twintip → ideal = 75*2.2/18 = 9.17 m² → snaps to 9 m².
    await expect(page.locator('text=9 m²').first()).toBeVisible();
    // Comfort window for 75 kg on a 9 m² twintip: idealKt = 75*2.2/9 = 18.33
    // → fromKt = round(18.33*0.8) = 15, toKt = round(18.33*1.3) = 24.
    await expect(page.getByText(/janela confortável 15–24 kt/)).toBeVisible();
    // Secondary kite: ideal 9.17 > 9 → next size up = 10 m².
    await expect(page.getByText(/Alternativa:\s*10 m²/)).toBeVisible();
  });

  test('slider moves update the computed size (user changes weight)', async ({ page }) => {
    await page.goto(KITE_URL, { waitUntil: 'networkidle' });

    // Push weight to 95 kg: ideal = 95*2.2/18 = 11.61 → snaps to 12 m².
    await page.locator('#kite-weight').fill('95');
    await page.locator('#kite-weight').dispatchEvent('change');
    await expect(page.locator('text=12 m²').first()).toBeVisible();
  });

  test('discipline foil needs a much smaller kite than twintip', async ({ page }) => {
    await page.goto(KITE_URL, { waitUntil: 'networkidle' });

    // Twintip 75kg/18kt = 9 m² (baseline asserted in the first test).
    await page.getByRole('radio', { name: 'Foil' }).click();
    // Foil factor 1.4: ideal = 75*1.4/18 = 5.83 → snaps to 6 m².
    await expect(page.locator('text=6 m²').first()).toBeVisible();
  });

  test('zero-wind edge: slider at minimum (6 kt) still produces a size, no crash', async ({ page }) => {
    await page.goto(KITE_URL, { waitUntil: 'networkidle' });

    // 75 kg at 6 kt twintip: ideal = 75*2.2/6 = 27.5 → snaps to the largest
    // production size, 17 m² (clamped at the top of the size list).
    await page.locator('#kite-wind').fill('6');
    await page.locator('#kite-wind').dispatchEvent('change');
    await expect(page.locator('text=17 m²').first()).toBeVisible();
  });

  test('extreme-wind edge: slider at maximum (45 kt) produces the smallest kite', async ({ page }) => {
    await page.goto(KITE_URL, { waitUntil: 'networkidle' });

    // 75 kg at 45 kt twintip: ideal = 75*2.2/45 = 3.67 → snaps to 4 m².
    await page.locator('#kite-wind').fill('45');
    await page.locator('#kite-wind').dispatchEvent('change');
    await expect(page.locator('text=4 m²').first()).toBeVisible();
  });

  test('mobile 390px: layout renders, outputs visible, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(KITE_URL, { waitUntil: 'networkidle' });

    await expect(page.locator('text=9 m²').first()).toBeVisible();
    // No horizontal scroll on a phone width.
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
  });
});

test.describe('wetsuit calculator', () => {
  test.beforeEach(async ({ page }) => {
    await interceptData(page, 'conditions.json', EMPTY_CONDITIONS);
  });

  test('desktop: default 17°C → 3/2 mm recommendation', async ({ page }) => {
    await page.goto(FATO_URL, { waitUntil: 'networkidle' });

    // Default temp is 17°C (the slider's initial value) → 3/2 band.
    await expect(page.locator('text=3/2 mm')).toBeVisible();
    // No extras at 17°C.
    await expect(page.getByText('Botas')).toHaveClass(/line-through/);
  });

  test('cold water edge (11°C) → 5/4 mm with boots and hood', async ({ page }) => {
    await page.goto(FATO_URL, { waitUntil: 'networkidle' });

    await page.locator('#wetsuit-temp').fill('11');
    await page.locator('#wetsuit-temp').dispatchEvent('change');
    await expect(page.locator('text=5/4 mm')).toBeVisible();
    // 5/4 band turns boots+hood ON (gloves stay off until colder).
    await expect(page.getByText('Botas', { exact: true })).not.toHaveClass(/line-through/);
    await expect(page.getByText('Capuz', { exact: true })).not.toHaveClass(/line-through/);
  });

  test('warm water edge (24°C) → rashguard/boardshorts, no extras', async ({ page }) => {
    await page.goto(FATO_URL, { waitUntil: 'networkidle' });

    await page.locator('#wetsuit-temp').fill('24');
    await page.locator('#wetsuit-temp').dispatchEvent('change');
    await expect(page.locator('text=Licra ou fato de banho')).toBeVisible();
  });

  test('windy checkbox shifts the band down (17°C windy ≈ 15.5°C → 4/3)', async ({ page }) => {
    await page.goto(FATO_URL, { waitUntil: 'networkidle' });

    await page.getByText('Dia ventoso').click();
    // 17 - 1.5 = 15.5 → still 4/3 band (>=14).
    await expect(page.locator('text=4/3 mm')).toBeVisible();
  });

  test('slider minimum (4°C) → coldest band, no crash', async ({ page }) => {
    await page.goto(FATO_URL, { waitUntil: 'networkidle' });

    await page.locator('#wetsuit-temp').fill('4');
    await page.locator('#wetsuit-temp').dispatchEvent('change');
    // 4°C is the coldest supported band — the page must still show a suit.
    await expect(page.locator('text=mm').first()).toBeVisible();
  });

  test('mobile 390px: outputs visible, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FATO_URL, { waitUntil: 'networkidle' });

    await expect(page.locator('text=3/2 mm')).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
  });
});

test.describe('tools locale parity (pt/en)', () => {
  test.beforeEach(async ({ page }) => {
    await interceptData(page, 'conditions.json', EMPTY_CONDITIONS);
  });

  test('EN pages show English labels and outputs', async ({ page }) => {
    await page.goto('/en/ferramentas/calculadora-kite/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Kite size calculator' })).toBeVisible();
    await expect(page.getByText('comfortable window 15–24 kt')).toBeVisible();

    await page.goto('/en/ferramentas/calculadora-fato/', { waitUntil: 'networkidle' });
    await expect(page.locator('text=3/2 mm')).toBeVisible();
    await expect(page.getByText('Boots', { exact: true })).toBeVisible();
  });
});
