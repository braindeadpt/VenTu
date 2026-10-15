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
    // v6 (#184): «Chegar e estar» (#chegar) é um bloco do contexto do spot,
    // logo a seguir ao «Estudar o spot», com Estacionamento · Comer · Dormir
    // como linhas da lista (estilo da lista da praia).
    const chegar = page.locator('#chegar');
    await expect(chegar).toBeVisible();
    await expect(chegar.locator('dt').filter({ hasText: /^Estacionamento$/ })).toBeVisible();
    await expect(chegar.locator('dt').filter({ hasText: /^Dormir$/ })).toBeVisible();
  });

  test('EN logistics block translates facilities/hazards tags (never the PT token verbatim)', async ({ page }) => {
    await page.goto('/en/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });

    // Facilities: linha da lista em «Chegar e estar», com os tokens EN unidos
    // («Parking · Restaurant · Kite school · WC»).
    const chegar = page.locator('#chegar');
    await expect(chegar.locator('dt').filter({ hasText: /^Facilities$/ })).toBeVisible();
    await expect(chegar.getByText(/Parking · Restaurant · Kite school · WC/)).toBeVisible();

    // Hazards: um só sítio na v6, a linha «Watch out» do «Estudar o spot»
    // (as dicas locais já não a repetem). Abre o <details> para a ler.
    const estudo = page.locator('#estudo');
    await estudo.locator('summary').click();
    await expect(estudo).toHaveAttribute('open', '');
    const atencao = estudo.locator('dt').filter({ hasText: /^Watch out$/ }).locator('xpath=following-sibling::dd[1]');
    await expect(atencao).toBeVisible();
    await expect(atencao).toContainText(/strong wind/i);
    await expect(atencao).toContainText(/currents/i);
    await expect(atencao).toContainText(/rocks/i);
    await expect(page.locator('#chegar').getByText(/strong wind/i)).toHaveCount(0);

    // The PT tokens never leak into the EN UI
    const main = page.locator('#main-content');
    await expect(main.getByText('Estacionamento', { exact: true })).toHaveCount(0);
    await expect(main.getByText(/Escola kite/)).toHaveCount(0);
    await expect(main.getByText(/Correntes/i)).toHaveCount(0);
    await expect(main.getByText(/Rochas/i)).toHaveCount(0);
  });

  test('hero meter is visible on photo header', async ({ page }) => {
    // Página v6 (#184): a nota vive no hero sobre a foto; de noite é a lua.
    const hero = page.locator('#agora');
    await expect(hero.getByTestId('spot-hero-foto').locator('img')).toBeVisible();
    await expect(hero.locator('[data-testid="spot-veredicto"] .nota')).toBeVisible();
    const role = await hero.locator('[data-testid="spot-veredicto"] .nota').getAttribute('role');
    if (role === 'meter') await expect(hero.getByRole('meter')).toBeVisible();
    else await expect(hero.getByRole('img', { name: /Noite|Night/ })).toBeVisible();
  });
});
