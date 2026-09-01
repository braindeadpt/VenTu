import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

test.describe('Homepage redesign', () => {
  test.beforeEach(async ({ page }) => {
    // O /pt/ serve o embed map-first (SpotMapInteractive não-hero, desktop) —
    // a legend coach de primeira visita pode abrir sobre o mapa.
    await preseedWindRingLegend(page);
    await page.goto('/pt/');
  });

  test('sr-only h1 mentions spots', async ({ page }) => {
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/spots/i);
  });

  test('map hero headline and explore link', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Onde está bom hoje/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /Explorar mapa/i })).toBeVisible();
  });

  test('top now section with firing title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /A bombar agora/i })).toBeVisible();
  });

  test('top now section renders firing copy in EN', async ({ page }) => {
    await page.goto('/en/');
    await expect(
      page.getByRole('heading', { name: /Firing now/i }),
    ).toBeVisible({ timeout: 15_000 });
    // «Only firing spots · by sport» — o rótulo EN do TopNow, não o placeholder pt.
    await expect(page.getByText('Only firing spots · by sport')).toBeVisible();
  });

  test('no full spot grid filters on home', async ({ page }) => {
    await expect(page.getByText('Mais spots para', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Limpar filtros', { exact: true })).toHaveCount(0);
  });

  test('footer trust strip shows Open-Meteo', async ({ page }) => {
    await expect(page.getByLabel(/Prova social/i).getByText('Open-Meteo')).toBeVisible();
  });

  test('HomepageSecondaryCta renders three cards', async ({ page }) => {
    const section = page.getByRole('heading', { name: /Mais para explorar/i }).locator('..');
    await expect(section.getByRole('link')).toHaveCount(3);
  });
});
