import { test, expect } from '@playwright/test';

test.describe('Homepage redesign', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/');
  });

  test('sr-only h1 mentions spots', async ({ page }) => {
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/spots/i);
  });

  test('aggregate score gauge is exposed as meter', async ({ page }) => {
    await expect(page.getByRole('meter').first()).toBeVisible({ timeout: 15_000 });
  });

  test('TrustStrip shows Open-Meteo', async ({ page }) => {
    const trustStrip = page.getByLabel(/Prova social|Trust indicators/i);
    await expect(trustStrip.getByText('Open-Meteo', { exact: true })).toBeVisible();
  });

  test('HomepageSecondaryCta renders three cards', async ({ page }) => {
    const section = page.getByRole('heading', { name: /Mais para explorar/i }).locator('..');
    await expect(section.getByRole('link')).toHaveCount(3);
  });
});
