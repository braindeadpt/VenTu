import { test, expect } from '@playwright/test';

test.describe('UI interactions audit', () => {
  test('locale switch PT → EN on homepage', async ({ page }) => {
    await page.goto('/pt/');
    await page.getByRole('link', { name: /Switch to English/i }).click();
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.getByRole('banner')).toContainText('Ven');
  });

  test('header navigation to explorar works', async ({ page }) => {
    await page.goto('/pt/');
    await page.getByRole('navigation').getByRole('link', { name: /Explorar/i }).click();
    await expect(page).toHaveURL(/\/pt\/explorar\/?/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('search palette finds Guincho and navigates', async ({ page }) => {
    await page.goto('/pt/');
    await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('Guincho');
    await dialog.getByRole('link', { name: /Guincho/i }).first().click();
    await expect(page).toHaveURL(/\/pt\/spots\/guincho\/?/);
    await expect(page.locator('main')).toContainText(/Guincho/i);
  });

  test('compare page: pick two spots and start compare', async ({ page }) => {
    await page.goto('/pt/compare/');
    await expect(page.getByText('Spot vs Spot')).toBeVisible();

    await page.getByPlaceholder('Procurar spot...').fill('Guincho');
    await page.getByRole('button', { name: /Guincho/i }).click();
    await page.getByPlaceholder('Procurar spot...').fill('Nazar');
    await page.getByRole('button', { name: /Nazar/i }).click();
    await page.getByRole('button', { name: 'Comparar' }).click();

    await expect(page.locator('main')).toContainText(/Guincho/i);
    await expect(page.locator('main')).toContainText(/Nazar/i);
  });

  test('favorites: add spot from detail page and see on favorites', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await page.getByRole('button', { name: /Adicionar Guincho aos favoritos/i }).click();
    await page.goto('/pt/favorites/');
    await expect(page.locator('main')).toContainText(/Guincho/i);
  });

  test('spots map page: list and map render', async ({ page }) => {
    await page.goto('/pt/spots/');
    await expect(page.getByRole('heading', { level: 1, name: /Spots/i })).toBeVisible();
    await page.waitForSelector('.leaflet-container', { timeout: 15_000 });
  });

  test('news archive: category filter updates URL', async ({ page }) => {
    await page.goto('/pt/news/');
    await page.getByRole('button', { name: 'S Surf' }).click();
    await expect(page).toHaveURL(/category=surf/);
  });

  test('explorar index lists SEO landings', async ({ page }) => {
    await page.goto('/pt/explorar/');
    await expect(page.locator('main')).toContainText(/Surf|Kitesurf/i);
  });

  test('livecams page lists cameras', async ({ page }) => {
    await page.goto('/pt/livecams/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('about and sazonalidade pages load', async ({ page }) => {
    await page.goto('/pt/about/');
    await expect(page.locator('main')).toBeVisible();
    await page.goto('/pt/sazonalidade/');
    await expect(page.locator('main')).toBeVisible();
  });

  test('spot detail: structured sections and sport tabs', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(
      page.getByRole('heading', { name: /Condições actuais|Current conditions/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Previsão horária|Hourly forecast/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Melhores janelas|Best windows/i }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /Localização|Location/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Câmara ao vivo|Live camera/i }),
    ).toHaveCount(1);

    const kiteTab = page.getByRole('button', { name: /Kitesurf/i });
    if (await kiteTab.isVisible()) {
      await kiteTab.click();
      await expect(kiteTab).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
