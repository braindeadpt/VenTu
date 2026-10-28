import { test, expect, type Locator } from '@playwright/test';
import { interceptConditions, notaV6DeNoite } from './helpers/conditions';

/**
 * Noite fora do /mapa (opção A, aprovada 28/10). O conditions.json servido é a
 * fixture com as 5 modalidades v6 de noite (`notaV6DeNoite`): as listas, a
 * grelha, o comparador e o widget re-hidratam client-side e têm de mostrar a
 * lua e a próxima janela — nunca «0», um «Vencedor» falso ou um número de dia
 * do SUP / wake. As janelas em si dependem da hora do CI (bake do build e
 * forecasts servidos), por isso as asserções são sobre o estado e a ordem
 * (com janela antes de sem janela), não sobre horas concretas.
 */

/** Índices das linhas com janela e sem janela, para a regra «sem janela no fim». */
async function ordemJanelas(rows: Locator): Promise<{ com: number[]; sem: number[] }> {
  const n = await rows.count();
  const com: number[] = [];
  const sem: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    if ((await r.locator('[data-noite-janela]').count()) > 0) com.push(i);
    else if ((await r.locator('[data-noite-sem-janela]').count()) > 0) sem.push(i);
  }
  return { com, sem };
}

test.describe('Noite fora do /mapa', () => {
  test.use({ serviceWorkers: 'block' });

  test('/spots tabela: lua no lugar do «0», faixa de noite, próxima janela; sem janela no fim', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture', all: notaV6DeNoite });
    await page.goto('/pt/spots/');
    const tabela = page.getByRole('region', { name: 'Ranking de spots', exact: true });
    await expect(tabela.locator('[data-faixa-noite]')).toBeVisible({ timeout: 20_000 });
    await expect(tabela.getByText('Noite · pela próxima janela boa')).toBeVisible();
    const rows = tabela.locator('tbody tr');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    await expect(tabela.locator('tbody tr[data-noite]')).toHaveCount(n);
    // coluna Score: a lua em todas as linhas, nenhum numeral
    await expect(tabela.locator('tbody tr td:nth-child(2) [data-noite]')).toHaveCount(n);
    await expect(tabela.locator('tbody tr td:nth-child(2) .font-mono')).toHaveCount(0);
    const { com, sem } = await ordemJanelas(rows);
    expect(com.length + sem.length).toBe(n);
    if (com.length && sem.length) expect(Math.max(...com)).toBeLessThan(Math.min(...sem));
    // a nota da janela aparece uma só vez por linha
    for (const i of com.slice(0, 5)) await expect(rows.nth(i).locator('[data-nota-janela]')).toHaveCount(1);
  });

  test('/spots grelha: cartões com lua e «Noite», sem banda nem «0»', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture', all: notaV6DeNoite });
    await page.goto('/pt/spots/');
    await page.getByRole('button', { name: 'Vista em cards' }).click();
    const lista = page.locator('section[aria-labelledby="spot-ranked-heading"]');
    await expect(lista.locator('[data-faixa-noite]')).toBeVisible({ timeout: 20_000 });
    const cartoes = lista.getByRole('listitem');
    await expect(cartoes.first().locator('[data-noite]')).toBeVisible();
    await expect(cartoes.first()).toContainText('Noite');
    await expect(cartoes.first()).not.toContainText('Não dá');
  });

  test('/spots de dia (fixture): sem estado de noite', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture' });
    await page.goto('/pt/spots/');
    const tabela = page.getByRole('region', { name: 'Ranking de spots', exact: true });
    await expect(tabela.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-faixa-noite]')).toHaveCount(0);
  });

  test('comparador: sem «Vencedor» falso; «Amanhã ganha …» ou «Ninguém com janela boa…»', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture', all: notaV6DeNoite });
    await page.goto('/pt/compare/?spots=guincho,carcavelos');
    const veredicto = page.locator('[data-compare-noite]');
    await expect(veredicto).toBeVisible({ timeout: 20_000 });
    await expect(veredicto.locator('[data-compare-ganha], [data-compare-ninguem]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByText('Vencedor', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^\d+\/10$/)).toHaveCount(0);
    const cards = page.locator('article:has([data-noite])');
    await expect(cards).toHaveCount(2);
    if ((await veredicto.locator('[data-compare-ganha]').count()) > 0) {
      await expect(veredicto).toContainText('Amanhã ganha');
      await expect(page.locator('[data-compare-ganha-cartao]')).toHaveText('Ganha amanhã');
    } else {
      await expect(veredicto).toContainText('Ninguém com janela boa nas próximas 24 horas');
      await expect(page.locator('[data-compare-ganha-cartao]')).toHaveCount(0);
    }
  });

  test('widget embed: de noite a lua (nunca o máximo de dia do SUP / wake)', async ({ page }) => {
    await interceptConditions(page, { base: 'fixture', all: notaV6DeNoite });
    await page.goto('/embed/spot/guincho/');
    const w = page.locator('[data-embed-widget]');
    await expect(w.locator('[data-noite]')).toBeVisible({ timeout: 20_000 });
    await expect(w).toContainText('Noite');
    await expect(w.locator('[data-noite-janela-embed]')).toBeVisible();
    await expect(w.locator('[aria-label$="/10"]')).toHaveCount(0);
  });
});
