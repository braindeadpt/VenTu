import { test, expect } from '@playwright/test';

/**
 * Secção de calibração do About — viés por boia (ondas).
 *
 * A secção é CLIENTE de propósito (WaveBiasSection busca wave-bias.json em
 * runtime, como o radar), por isso é possível alterná-la de forma determinística
 * interceptando o ficheiro — o About é estático (SSG), logo o HTML baked a
 * build não seria testável via page.route.
 *
 * Casos:
 *  1. wave-bias.json com boias ES (e IH) → tabela com a origem e stats.
 *  2. ficheiro em falta / 404 → a secção não aparece.
 */
const ES_BUOYS = {
  fetchedAt: '2026-08-15T06:00:00.000Z',
  buoys: {
    '6200085': { name: 'Golfo de Cádiz', area: 'Golfo de Cádiz', source: 'wmo-es', n: 38, me: -0.12, mae: 0.34, rmse: 0.41, corr: 0.93 },
    '6200084': { name: 'Cabo Silleiro', area: 'Galiza', source: 'wmo-es', n: 40, me: 0.28, mae: 0.4, rmse: 0.52, corr: 0.91 },
    // Boia IH (Datawell) — presente quando a IH_API_KEY está configurada.
    '4': { name: 'Leixões', area: 'Norte', source: 'ih', n: 45, me: 0.1, mae: 0.3, rmse: 0.4 },
  },
};

const SKILL = {
  fetchedAt: '2026-08-15T06:00:00.000Z',
  pairCount: 82,
  byOrigin: {
    ih: { n: 45, me: 0.1 },
    'wmo-es': { n: 37, me: -0.15 },
  },
  byBuoy: {
    // key por id — o mesmo id que o wave-bias usa no `code` (Cabo Silleiro).
    '6200084': { buoyName: 'Cabo Silleiro', n: 37, me: -0.15, mae: 0.4, rmse: 0.5, origin: 'wmo-es' },
    // Leixões (IH, idEst 4) sem skill ainda → «—» nas colunas Skill.
  },
};

test.describe('About — secção de viés por boia (ondas)', () => {
  test.use({ serviceWorkers: 'block' });

  test('mostra a tabela quando o wave-bias.json tem boias ES (e IH)', async ({ page }) => {
    await page.route('**/data/wave-bias.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ES_BUOYS),
      });
    });
    await page.route('**/data/forecast-skill.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SKILL),
      });
    });

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });

    const section = page.locator('[data-wave-bias-section="true"]');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section).toContainText('Calibração — viés por boia (ondas)');

    // Coluna Origem + linhas por boia (IH e ES com stats correctas).
    const table = section.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Cabo Silleiro');
    await expect(table).toContainText('Golfo de Cádiz');
    await expect(table).toContainText('Leixões');
    await expect(table).toContainText('Origem'); // coluna de origem (pt)
    // Origem por linha.
    await expect(table).toContainText('WMO-ES');
    await expect(table).toContainText('IH');

    // Rodapé com contagem por plataforma.
    await expect(section).toContainText('ES 2');
    await expect(section).toContainText('IH 1');

    // Colunas de skill real (forecast-skill) por boia — Silleiro tem, Leixões não.
    const silleiro = table.getByRole('row', { name: /Cabo Silleiro/ });
    await expect(silleiro).toContainText('-0.15'); // skill ME
    await expect(silleiro).toContainText('37'); // skill n
    const leixoes = table.getByRole('row', { name: /Leixões/ });
    // Sem skill para Leixões → colunas de skill vazias («—»).
    await expect(leixoes).toContainText('+0.10'); // bias ME
    await expect(leixoes).not.toContainText('-0.15'); // não herda o skill do Silleiro
  });

  test('a secção não aparece quando o ficheiro falta (404)', async ({ page }) => {
    await page.route('**/data/wave-bias.json', (route) => route.fulfill({ status: 404 }));
    await page.route('**/data/forecast-skill.json', (route) => route.fulfill({ status: 404 }));

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500); // deixa o fetch resolver → sem dados

    await expect(page.locator('[data-wave-bias-section="true"]')).toHaveCount(0);
    await expect(page.getByText('Calibração — viés por boia (ondas)')).toHaveCount(0);
  });
});