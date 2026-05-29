import { test, expect } from '@playwright/test';

test.describe('Home adaptive layout', () => {
  test('new visitor: featured map hero and top now', async ({ page }) => {
    await page.goto('/pt/');
    await page.evaluate(() => localStorage.setItem('windspot-favorites', '[]'));

    await expect(
      page.getByRole('heading', { name: /Onde está bom hoje/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: /Explorar mapa/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /A bombar agora/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Os teus spots, agora/i })).toHaveCount(0);
  });

  test('returning visitor: favorites section when ids saved', async ({ page }) => {
    await page.goto('/pt/');
    await page.evaluate(() => {
      localStorage.setItem('windspot-favorites', JSON.stringify(['guincho']));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Os teus spots, agora/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('region', { name: /Mapa interactivo/i })).toBeVisible();
  });

  test('wave dividers separate home zones', async ({ page }) => {
    await page.goto('/pt/');
    await expect(page.locator('.motion-safe\\:animate-wave-drift').first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('favorite toast on heart click', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await page.getByRole('button', { name: /Adicionar Guincho aos favoritos/i }).first().click();
    await expect(page.getByText('Adicionado aos teus spots')).toBeVisible();
  });
});
