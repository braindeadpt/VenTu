import { test, expect } from '@playwright/test';

test.describe('Critical routes', () => {
  test('homepage PT loads', async ({ page }) => {
    await page.goto('/pt/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(page.getByRole('status').first()).toBeVisible();
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('homepage EN loads', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.getByRole('banner')).toContainText('Ven');
    await expect(page.getByRole('status').first()).toBeVisible();
    await expect(page.locator('h1.sr-only')).toBeAttached();
  });

  test('spot detail page loads', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await expect(page.locator('main')).toContainText(/Guincho/i, { timeout: 15_000 });
  });

  test('spots list with map loads', async ({ page }) => {
    await page.goto('/pt/spots/');
    await expect(page.getByRole('heading', { level: 1, name: /Spots/i })).toBeVisible({ timeout: 15_000 });
  });

  test('compare page loads', async ({ page }) => {
    await page.goto('/pt/compare/');
    await expect(page.getByText('Spot vs Spot')).toBeVisible({ timeout: 15_000 });
  });

  test('favorites page loads', async ({ page }) => {
    await page.goto('/pt/favorites/');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
  });

  test('news archive loads', async ({ page }) => {
    await page.goto('/pt/news/');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
  });

  test('404 is localized PT', async ({ page }) => {
    await page.goto('/pt/spots/spot-que-nao-existe/');
    await expect(page.getByRole('heading', { name: /Página não encontrada/i })).toBeVisible({ timeout: 15_000 });
  });

  test('404 is localized EN', async ({ page }) => {
    await page.goto('/en/spots/spot-that-does-not-exist/');
    await expect(page.getByRole('heading', { name: /Page not found/i })).toBeVisible({ timeout: 15_000 });
  });

  test('search palette opens', async ({ page }) => {
    await page.goto('/pt/');
    await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('big-wave modality filter page loads', async ({ page }) => {
    await page.goto('/pt/modalidades/big-wave/');
    await expect(page.getByRole('heading', { level: 1, name: /Big Wave/i })).toBeVisible({ timeout: 15_000 });
  });

  test('homepage filters sync to URL and persist on reload', async ({ page }) => {
    await page.goto('/pt/');
    await page.getByRole('button', { name: 'Kitesurf', exact: true }).click();
    await expect(page).toHaveURL(/sport=kitesurf/);
    await page.getByRole('button', { name: 'Algarve', exact: true }).click();
    await expect(page).toHaveURL(/region=Algarve/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Algarve', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('admin contributions page loads', async ({ page }) => {
    await page.goto('/pt/admin/contributions/');
    const loginHeading = page.getByRole('heading', { name: /Admin — Contribuições/i });
    const unconfigured = page.getByText(/Supabase não configurado|Supabase is not configured/i);
    await expect(loginHeading.or(unconfigured)).toBeVisible({ timeout: 15_000 });
  });
});
