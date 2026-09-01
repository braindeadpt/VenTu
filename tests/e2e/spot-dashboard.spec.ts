import { test, expect } from '@playwright/test';

const SPOT_SLUG = 'guincho';

test.describe('Spot detail dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('has no related news section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Notícias relacionadas|Related news/i })).toHaveCount(0);
    await expect(page.getByText(/SpotRelatedNews/i)).toHaveCount(0);
  });

  test('Como chegar links to Google Maps directions', async ({ page }) => {
    const directions = page.getByRole('link', { name: /Como chegar/i }).first();
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir/);
    await expect(directions).toHaveAttribute('target', '_blank');
  });

  test('logistics block shows parking and stay', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Logística$/i })).toBeVisible();
    await expect(page.getByText('Estacionamento', { exact: true })).toBeVisible();
    await expect(page.getByText('Dormir', { exact: true })).toBeVisible();
  });

  test('EN logistics block translates facilities/hazards tags (never the PT token verbatim)', async ({ page }) => {
    await page.goto('/en/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });

    // Card labels translated (spans, not headings)
    await expect(page.getByText('Facilities', { exact: true })).toBeVisible();
    await expect(page.getByText('Hazards', { exact: true })).toBeVisible();

    // Facilities body is the joined EN tokens («Parking · Restaurant · Kite school · WC»)
    await expect(page.getByText(/Parking · Restaurant · Kite school · WC/)).toBeVisible();

    // Hazards render as translated list items (listitem is not a name-from-contents
    // role, so use a DOM locator — getByRole({ name }) never matches text here)
    await expect(page.locator('li', { hasText: /^Strong wind$/ })).toBeVisible();
    await expect(page.locator('li', { hasText: /^Currents$/ })).toBeVisible();
    await expect(page.locator('li', { hasText: /^Rocks$/ })).toBeVisible();

    // The PT tokens never leak into the EN UI
    await expect(page.getByText('Estacionamento', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Escola kite', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Correntes', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Rochas', { exact: true })).toHaveCount(0);
  });

  test('hero meter is visible on photo header', async ({ page }) => {
    await expect(page.getByRole('meter')).toBeVisible();
  });
});
