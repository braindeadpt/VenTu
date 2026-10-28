import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptConditions, notaV6DeNoite } from './helpers/conditions';

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
    // #183: o hero é a v6 — a palavra gigante («VAI.»/«Dá.»/«Não vai.»/«Noite.»), a frase
    // nacional e o nº 1; o mapa completo continua a um toque (#273: o cartão «Explorar o mapa
    // da costa» e o «Mapa da costa» do cabeçalho → /mapa).
    await expect(page.getByTestId('home-palavra')).toHaveText(/^(Vai\.|Dá\.|Não vai\.|Noite\.)/, { timeout: 15_000 });
    await expect(page.getByTestId('home-frase')).not.toBeEmpty();
    await expect(page.getByTestId('home-mapa').getByRole('link', { name: 'Explorar o mapa da costa' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Mapa da costa', exact: true })).toHaveAttribute('href', '/pt/mapa/');
  });

  test('top now section with firing title', async ({ page }) => {
    // Nome exacto: de noite o h3 do estado vazio («Ninguém a bombar agora 😴») também casa.
    await expect(page.getByRole('heading', { name: 'A bombar agora', exact: true })).toBeVisible();
  });

  test('no full spot grid filters on home', async ({ page }) => {
    await expect(page.getByText('Mais spots para', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Limpar filtros', { exact: true })).toHaveCount(0);
  });

  test('footer trust strip shows Open-Meteo', async ({ page }) => {
    await expect(page.getByLabel(/Prova social/i).getByText('Open-Meteo')).toBeVisible();
  });

  test('footer lists the three secondary tools as compact links (C3)', async ({ page }) => {
    const section = page.getByLabel(/Mais ferramentas|More tools/i);
    await expect(section.getByRole('link')).toHaveCount(3);
    await expect(section.getByRole('link', { name: /Sazonalidade/i })).toBeVisible();
    await expect(section.getByRole('link', { name: /Comparar spots/i })).toBeVisible();
    await expect(section.getByRole('link', { name: /Favoritos/i })).toBeVisible();
  });
});

/**
 * «A bombar agora» independente da hora do CI (#218 PR 6): o TopNow re-hidrata
 * client-side do conditions.json servido, por isso estes testes servem a FIXTURE
 * (notaV6 diurno → há cards) ou a mesma fixture com as 5 modalidades v6 de noite
 * (→ estado vazio, o comportamento correcto de madrugada).
 */
test.describe('Homepage — A bombar agora (fixture, qualquer hora)', () => {
  // O SW serve /data/* do cache e burla o page.route — ver helpers/conditions.ts.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
  });

  test('top now section renders firing copy in EN', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture' });
    await page.goto('/en/');
    await expect(
      page.getByRole('heading', { name: 'Firing now', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    // «Only firing spots · …» — o rótulo EN do TopNow, não o placeholder pt.
    // Desde o #135 o sufixo varia (modo adaptativo «across every sport» ou o
    // desporto escolhido), por isso só o prefixo é fixo.
    // Scoped to main: home streams the hero/TopNow in a hidden S: container;
    // during the reveal window an unscoped getByText can match both copies.
    await expect(
      page.locator('#main-content').getByText(/^Only firing spots · /).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('region', { name: 'Firing now' }).getByRole('listitem').first(),
    ).toBeVisible();
  });

  test('de noite (5 modalidades v6 sem nota) → estado vazio «Ninguém a bombar agora», sem cards', async ({
    page,
  }) => {
    await interceptConditions(page, { base: 'fixture', all: notaV6DeNoite });
    await page.goto('/pt/');
    const section = page.getByRole('region', { name: 'A bombar agora' });
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect(section.getByRole('heading', { name: 'Ninguém a bombar agora 😴' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(section.getByText('Nenhum desporto a bombar neste momento')).toBeVisible();
    await expect(section.getByRole('listitem')).toHaveCount(0);
    await expect(section.getByRole('link', { name: 'Ver previsões' })).toBeVisible();
  });
});
