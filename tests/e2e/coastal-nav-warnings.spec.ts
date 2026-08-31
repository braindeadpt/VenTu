import { test, expect } from '@playwright/test';
import { interceptCoastalNavWarnings } from './helpers/conditions';

/**
 * Avisos à Navegação Costeiros (IH) — CoastalNavWarnings.
 *
 * The IH OGC API (nav_warning_coastal, keyless) is baked into
 * public/data/ih-coastal-warnings.json with a per-spot coverage map
 * (point-in-polygon). The spot page shows the block ONLY when the spot is
 * covered by a warning in force — never the empty section.
 *
 * These tests craft the file (deterministic — real warnings expire), so the
 * service worker must be blocked for page.route to apply.
 */

const FILE = {
  warnings: [
    {
      id: 18271,
      ref: 'ANAV NR 18271/26',
      category: 'Exercício militar',
      url: 'https://geoanavnet.hidrografico.pt/',
    },
    {
      id: 18265,
      ref: 'ANAV NR 18265/26',
      category: 'Requisitos de segurança maritima',
      url: '',
    },
  ],
  coverage: { trafaria: [18271], troia: [18265] },
  fetchedAt: '2026-08-15T08:00:00Z',
  sourceCollection: 'nav_warning_coastal',
};

test.describe('Avisos à Navegação Costeiros (IH)', () => {
  test.use({ serviceWorkers: 'block' });

  test('spot coberto → bloco com ref, categoria, link de detalhe e fonte', async ({ page }) => {
    await interceptCoastalNavWarnings(page, FILE);
    await page.goto('/pt/spots/trafaria/');
    await expect(page.getByRole('heading', { level: 1, name: /Trafaria/i })).toBeVisible({
      timeout: 20_000,
    });

    const block = page.getByTestId('coastal-nav-warnings');
    await expect(block).toBeVisible({ timeout: 20_000 });
    await expect(block.getByText('Avisos à navegação costeira (IH)')).toBeVisible();
    await expect(block.getByText('ANAV NR 18271/26')).toBeVisible();
    await expect(block.getByText('Exercício militar')).toBeVisible();
    await expect(block.getByRole('link', { name: /detalhe/i })).toBeVisible();
    await expect(
      block.getByText(/Instituto Hidrográfico · Avisos à Navegação Costeiros/),
    ).toBeVisible();
  });

  test('spot sem cobertura → bloco ausente (nunca a secção vazia)', async ({ page }) => {
    await interceptCoastalNavWarnings(page, FILE);
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('coastal-nav-warnings')).toHaveCount(0);
    // A secção de avisos (IPMA/radar) continua a renderizar.
    await expect(page.getByRole('heading', { name: /Avisos e radar/i })).toBeVisible();
  });

  test('ficheiro em falta (404) → bloco ausente sem quebrar a página', async ({ page }) => {
    await page.route('**/data/ih-coastal-warnings.json', (route) =>
      route.fulfill({ status: 404, body: 'nope' }),
    );
    await page.goto('/pt/spots/trafaria/');
    await expect(page.getByRole('heading', { level: 1, name: /Trafaria/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('coastal-nav-warnings')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Avisos e radar/i })).toBeVisible();
  });
});
