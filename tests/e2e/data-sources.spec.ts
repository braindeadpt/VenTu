import { test, expect } from '@playwright/test';

/**
 * Página «Fontes de dados» (/fontes) — lista todas as fontes do projecto com
 * licença e atribuição obrigatória (Open-Meteo, IPMA, IH, MeteoAlarm, Esri,
 * Copernicus, OSM/CARTO, …), com ligação a partir do footer.
 */
test.describe('Fontes de dados (data sources)', () => {
  test('lista todas as fontes obrigatórias com atribuição', async ({ page }) => {
    await page.goto('/pt/fontes/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Fontes de dados' }),
    ).toBeVisible({ timeout: 20_000 });

    const table = page.getByTestId('data-sources-table');
    await expect(table).toBeVisible();

    // Fontes obrigatórias presentes.
    for (const source of [
      'Open-Meteo',
      'Instituto Hidrográfico (IH)',
      'IPMA',
      'MeteoAlarm (EUMETNET)',
      'Copernicus Marine Service',
      'Esri World Imagery',
    ]) {
      await expect(table.getByText(source, { exact: true }).first()).toBeVisible();
    }

    // Cadeias de atribuição obrigatórias (as mesmas que o About / mapa usam).
    await expect(table.getByText('Weather data by Open-Meteo.com', { exact: false })).toBeVisible();
    await expect(
      table.getByText(/Generated using E\.U\. Copernicus Marine Service Information/),
    ).toBeVisible();
    await expect(table.getByText(/Imagery © Esri/)).toBeVisible();

    // Licença CC BY 4.0 ligada ao creativecommons.
    await expect(table.locator('a[href="https://creativecommons.org/licenses/by/4.0/"]').first()).toBeVisible();
  });

  test('footer liga à página de fontes (pt)', async ({ page }) => {
    await page.goto('/pt/');
    const footerLink = page.getByRole('link', { name: 'Fontes oficiais' });
    await expect(footerLink).toBeVisible({ timeout: 20_000 });
    await footerLink.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fontes de dados' })).toBeVisible();
  });

  test('versão EN com as mesmas fontes', async ({ page }) => {
    await page.goto('/en/fontes/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data sources' }),
    ).toBeVisible({ timeout: 20_000 });
    const table = page.getByTestId('data-sources-table');
    await expect(table.getByText('Open-Meteo', { exact: true })).toBeVisible();
    await expect(table.getByText(/Weather data by Open-Meteo\.com/)).toBeVisible();
  });
});
