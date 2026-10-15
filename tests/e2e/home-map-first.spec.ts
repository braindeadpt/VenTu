import { test, expect } from '@playwright/test';

/**
 * Home map-first (#183, home v6): o mapa da costa vive ao lado do «VAI.» no desktop e numa
 * faixa depois do top 3 no telemóvel (com «Abrir mapa» para o ecrã inteiro). MapLibre 3D lazy
 * com fallback plano; o selector é só Kite · Surf; o mapa completo continua em /mapa
 * («Mapa da costa»).
 */
test.describe('Home map-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/');
  });

  test('map hero region with interactive map', async ({ page }) => {
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero).toBeVisible({ timeout: 15_000 });
    await expect(hero.getByLabel(/A costa portuguesa em 3D/i)).toBeVisible({ timeout: 20_000 });
    // o poster dá lugar ao 3D (WebGL2) ou ao mapa plano: nunca fica vazio
    await expect(hero.locator('figure')).toHaveAttribute('data-modo', /^(3d|plano)$/, { timeout: 20_000 });
    await expect(hero.locator('figure')).toHaveAttribute('data-pronto', '1', { timeout: 30_000 });
    await expect(hero.getByTestId('home-rotulos').locator('.rot').first()).toBeVisible({ timeout: 20_000 });
  });

  test('single sport filter row in map hero', async ({ page }) => {
    const sportGroup = page.getByTestId('home-modo').getByRole('group', { name: /Modalidade|Sport/i });
    await expect(sportGroup).toBeVisible({ timeout: 15_000 });
    await expect(sportGroup.getByRole('button')).toHaveCount(2);
    await expect(sportGroup.getByRole('button', { name: 'Kite', exact: true })).toBeVisible();
    await expect(sportGroup.getByRole('button', { name: 'Surf', exact: true })).toBeVisible();
    // sem filtros de região na home
    await expect(page.getByRole('button', { name: 'Algarve', exact: true })).toHaveCount(0);
  });

  test('explorar mapa CTA links to /mapa', async ({ page }) => {
    const link = page.getByTestId('home-v6-rodape').getByRole('link', { name: /Mapa da costa/i });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute('href', /\/pt\/mapa\//);
  });
});

test.describe('Home map-first (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('featured hero map strip is not covered and opens full screen', async ({ page }) => {
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    const fig = hero.locator('figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-modo', /^(3d|plano)$/, { timeout: 20_000 });
    const box = await fig.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(250);
    // faixa: min(40svh, 340px), mín. 250
    expect(box?.height ?? 0).toBeLessThanOrEqual(341);
    await hero.getByRole('button', { name: 'Abrir mapa' }).click();
    await expect(page.getByRole('dialog', { name: /Mapa interactivo/i })).toBeVisible();
  });
});
