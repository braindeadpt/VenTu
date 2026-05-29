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

  test('hero meter is visible on photo header', async ({ page }) => {
    await expect(page.getByRole('meter')).toBeVisible();
  });
});
