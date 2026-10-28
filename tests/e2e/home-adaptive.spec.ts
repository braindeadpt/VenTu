import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

test.describe('Home adaptive layout', () => {
  test.beforeEach(async ({ page }) => {
    // O /pt/ serve o embed map-first (SpotMapInteractive não-hero, desktop) —
    // a legend coach de primeira visita pode abrir sobre o mapa.
    await preseedWindRingLegend(page);
  });
  test('new visitor: featured map hero and top now', async ({ page }) => {
    await page.goto('/pt/');

    // #183: o hero em destaque é a v6 (palavra, frase nacional, nº 1, mapa da costa)
    await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('home-lider')).toBeVisible();
    await expect(page.getByRole('region', { name: /Mapa interactivo/i })).toBeVisible();
    // #273: o cartão do mapa é a porta do /mapa (e «Mapa da costa» passou ao cabeçalho)
    await expect(page.getByTestId('home-mapa').getByRole('link', { name: 'Explorar o mapa da costa' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Mapa da costa', exact: true })).toBeVisible();
    // Nome exacto: de noite o h3 do estado vazio («Ninguém a bombar agora 😴») também casa.
    await expect(page.getByRole('heading', { name: 'A bombar agora', exact: true })).toBeVisible();
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
    await waitHydrated(page);
    await page.getByRole('button', { name: /Entrar para guardar Guincho|Sign in to save Guincho/i }).first().click();
    await expect(page.getByRole('dialog', { name: /Entrar|Sign in/i })).toBeVisible();
  });
});
