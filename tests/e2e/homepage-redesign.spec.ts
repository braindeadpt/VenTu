import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptConditions, notaV6DeNoite } from './helpers/conditions';

test.describe('Homepage redesign', { tag: '@core' }, () => {
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

  test('unified v6 homepage has Top 8 without repeating «A bombar agora»', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'A bombar agora', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Top 8/i })).toBeVisible();
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
test.describe('Homepage — Top 8 e noite (fixture, qualquer hora)', { tag: '@core' }, () => {
  // O SW serve /data/* do cache e burla o page.route — ver helpers/conditions.ts.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
  });

  test('EN homepage renders unified v6 hero and Top 8 without repeating Firing now', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture' });
    await page.goto('/en/');
    await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Firing now', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Top 8/i })).toBeVisible({ timeout: 15_000 });
  });

  test('de noite o Top 8 é «Top 8 · próxima janela»: lua no lugar do «0», sem janela no fim', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture', all: notaV6DeNoite });
    await page.goto('/pt/');
    const top = page.getByRole('region', { name: 'Top 8 · próxima janela', exact: true });
    await expect(top).toBeVisible({ timeout: 20_000 });
    await expect(top.getByText('Noite · pela próxima janela boa')).toBeVisible();
    const rows = top.locator('tbody tr');
    await expect(rows).toHaveCount(8);
    await expect(top.locator('tbody tr[data-noite]')).toHaveCount(8);
    await expect(top.locator('tbody tr td:nth-child(2) .font-mono')).toHaveCount(0);
    const temJanela: boolean[] = [];
    for (let i = 0; i < 8; i++) temJanela.push((await rows.nth(i).locator('[data-noite-janela]').count()) > 0);
    // regra aprovada: com janela primeiro, sem janela no fim
    expect(temJanela.indexOf(false) === -1 || !temJanela.slice(temJanela.indexOf(false)).includes(true)).toBe(true);
  });
});
