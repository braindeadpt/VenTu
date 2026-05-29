import { test, expect } from '@playwright/test';

test.describe('Home map-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/');
  });

  test('map hero region with interactive map', async ({ page }) => {
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero).toBeVisible({ timeout: 15_000 });
    await expect(hero.getByLabel(/Mapa dos spots/i)).toBeVisible({ timeout: 20_000 });
    await expect(hero.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
  });

  test('single sport filter row in map hero', async ({ page }) => {
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero).toBeVisible({ timeout: 15_000 });

    const sportGroup = hero.getByRole('group', { name: /Filtrar por desporto|Filter by sport/i });
    await expect(sportGroup).toBeVisible();
    await expect(sportGroup.getByRole('button', { name: 'Surf', exact: true })).toBeVisible();
    await expect(sportGroup.getByRole('button', { name: 'Kitesurf', exact: true })).toBeVisible();

    await expect(hero.getByRole('button', { name: 'Algarve', exact: true })).toHaveCount(0);
  });

  test('explorar mapa CTA links to /mapa', async ({ page }) => {
    const link = page.getByRole('link', { name: /Explorar mapa/i });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute('href', /\/pt\/mapa\//);
  });
});
