import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { openMapSpotSheet } from './helpers/map-sheet';

/**
 * Mobile touch playtest — permanent regression spec for the manual matrix
 * driven at 390×844 (iPhone-ish) with real touch taps:
 *
 *   hamburger drawer → theme toggle → search palette → kite calculator →
 *   wetsuit calculator → alerts gate (signed out) → map spot sheet.
 *
 * Conventions kept from the manual session:
 * - `hasTouch` contexts so `tap()` fires real touch events.
 * - Sliders are React 19 controlled ranges: synthetic dispatchEvent does NOT
 *   commit; use keyboard arrows on the focused slider (what a user does).
 * - Map flow reuses the shared openMapSpotSheet helper (retry pattern).
 * - The alerts surface is account-gated: the signed-out gate (magic-link
 *   prompt) IS the asserted behavior, not a defect.
 */
test.describe('mobile playtest (390×844, touch)', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('drawer: opens, conditions section pre-expanded, accordion toggles', async ({ page }) => {
    await page.goto('/pt/', { waitUntil: 'domcontentloaded' });

    const burger = page.getByRole('button', { name: 'Abrir menu' });
    await burger.tap();
    // The mobile drawer is a role="navigation" region (#mobile-nav), not a dialog.
    const drawer = page.locator('#mobile-nav');
    await expect(drawer).toBeVisible();

    // Conditions section is expanded by default on mobile.
    const conditionsBtn = drawer.getByRole('button', { name: /Condições/ }).first();
    await expect(conditionsBtn).toHaveAttribute('aria-expanded', 'true');

    // Toggle it closed, then back open.
    await conditionsBtn.tap();
    await expect(conditionsBtn).toHaveAttribute('aria-expanded', 'false');
    await conditionsBtn.tap();
    await expect(conditionsBtn).toHaveAttribute('aria-expanded', 'true');
  });

  test('drawer: Escape closes and focus returns to the hamburger', async ({ page }) => {
    await page.goto('/pt/', { waitUntil: 'domcontentloaded' });

    const burger = page.getByRole('button', { name: 'Abrir menu' });
    await burger.tap();
    await expect(page.locator('#mobile-nav')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-nav')).toBeHidden();
    await expect(burger).toBeFocused();
  });

  test('theme toggle inside drawer switches to ocean and back', async ({ page }) => {
    await page.goto('/pt/', { waitUntil: 'domcontentloaded' });

    const drawer = page.locator('#mobile-nav');
    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    await expect(drawer).toBeVisible();

    // Scope to the drawer: two ThemeToggle copies exist (desktop action row
    // + drawer) and .first() alone can resolve the hidden desktop one.
    const inDrawer = drawer.getByRole('button', { name: 'Alternar para tema claro' });
    await expect(inDrawer).toBeVisible();
    await inDrawer.tap();

    await expect(page.locator('html')).toHaveClass(/theme-ocean/);
    // Persisted across reload.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/theme-ocean/);

    // Back to dark via the (now relabelled) toggle in the reopened drawer.
    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    const backToDark = drawer.getByRole('button', { name: 'Alternar para tema escuro' });
    await expect(backToDark).toBeVisible();
    await backToDark.tap();
    await expect(page.locator('html')).not.toHaveClass(/theme-ocean/);
  });

  test('search palette: opens from header, finds spots, Escape closes', async ({ page }) => {
    await page.goto('/pt/', { waitUntil: 'domcontentloaded' });

    // Two triggers share the aria-label (desktop hidden lg:flex + mobile
    // lg:hidden); only the mobile one is visible at 390px — filter to it.
    const trigger = page
      .getByRole('button', { name: 'Pesquisar' })
      .locator('visible=true')
      .first();
    await trigger.tap();

    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible();

    const input = palette.getByPlaceholder('Pesquisar spots, regiões...');
    await input.fill('nazaré');
    await expect(
      palette.locator('a, button, [role="option"]').filter({ hasText: /nazaré/i }).first(),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('kite calculator: sliders drive the recommendation', async ({ page }) => {
    await page.goto('/pt/ferramentas/calculadora-kite/', { waitUntil: 'domcontentloaded' });

    const weight = page.locator('#kite-weight');
    const wind = page.locator('#kite-wind');
    await expect(weight).toBeVisible();
    await expect(wind).toBeVisible();

    // Real user gesture: focus + arrow keys (React controlled ranges ignore
    // synthetic dispatched input events).
    await weight.focus();
    for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowLeft');
    const weightVal = Number(await weight.inputValue());
    expect(weightVal).toBeGreaterThanOrEqual(40);

    await wind.focus();
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowRight');

    const output = page.locator('[aria-live="polite"]');
    await expect(output.getByText(/\d+\s*m²/)).toBeVisible();
    await expect(output.getByText(/\d+–\d+\s*kt/)).toBeVisible();
  });

  test('wetsuit calculator: extreme temp changes the suit', async ({ page }) => {
    await page.goto('/pt/ferramentas/calculadora-fato/', { waitUntil: 'domcontentloaded' });

    const temp = page.locator('#wetsuit-temp');
    await temp.focus();
    for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowLeft');

    const output = page.locator('[aria-live="polite"]');
    await expect(output.getByText(/mm|rashguard|liga/i)).toBeVisible();
    // Cold extreme must include the accessories.
    await expect(output.getByText(/Botas|Luvas|Capuz/).first()).toBeVisible();
  });

  test('alerts gate: signed-out shows the magic-link gate', async ({ page }) => {
    await page.goto('/pt/favorites/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: /Meus Favoritos|My Favorites/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Entrar com magic link/i }).or(
        page.getByRole('link', { name: /Entrar com magic link/i }),
      ),
    ).toBeVisible();
  });

  test('map sheet: marker tap opens the spot sheet on mobile', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded' });

    const sheet = await openMapSpotSheet(page);
    await expect(sheet.getByRole('link', { name: /Ver spot/i })).toBeVisible();

    const close = sheet.getByRole('button', { name: /Fechar|Close/i });
    if (await close.isVisible().catch(() => false)) {
      await close.tap();
      await expect(sheet).toBeHidden();
    }
  });
});
