import { test, expect } from '@playwright/test';

test.describe('Home adaptive layout', () => {
  test('new visitor: featured map hero and top now', async ({ page }) => {
    await page.goto('/pt/');

    await expect(
      page.getByRole('heading', { name: /Onde está bom hoje/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: /Explorar mapa/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /A bombar agora/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Os teus spots, agora/i })).toHaveCount(0);
  });

  test('returning visitor: favorites section requires login (F1)', async ({ page }) => {
    await page.goto('/pt/');
    await expect(page.getByRole('heading', { name: /Os teus spots, agora/i })).toHaveCount(0);
  });

  test('wave dividers separate home zones', async ({ page }) => {
    await page.goto('/pt/');
    await expect(page.locator('.motion-safe\\:animate-wave-drift').first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('favorite heart opens login when signed out', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await page.getByRole('button', { name: /Entrar para guardar Guincho|Sign in to save Guincho/i }).first().click();
    await expect(page.getByRole('dialog', { name: /Entrar|Sign in/i })).toBeVisible();
  });
});
