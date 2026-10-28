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
    // a descrição do estado vazio não fala de «mar de espelho hoje» à noite (opção A, 28/10)
    await expect(section.getByText(/É de noite na costa/)).toBeVisible();
    await expect(section.getByText(/Mar de espelho/)).toHaveCount(0);
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
