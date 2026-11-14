import { test, expect } from '@playwright/test';

/**
 * #476: o /spots é estático e o HTML trazia as 189 linhas do «Todos», mas a
 * hidratação aplicava o filtro por omissão (`surf`) e cortava para 147 — a lista
 * e os links mudavam no mount. O SSR tem de desenhar já o mesmo filtro que o
 * efeito de mount resolve sem `?sport=` e sem preferência guardada.
 */

test.describe('/spots — SSR e cliente com o mesmo filtro', () => {
  test('o HTML exportado já traz o filtro que a hidratação aplica', async ({ page }) => {
    const html = await (await page.request.get('/pt/spots/')).text();
    const tbody = html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
    const linhas = (tbody.match(/<tr[\s>]/g) ?? []).length;
    expect(linhas).toBeGreaterThan(0);
    // todas as linhas do HTML estático apontam para o spot com o filtro já resolvido
    expect((tbody.match(/\?sport=surf/g) ?? []).length).toBe(linhas);

    await page.goto('/pt/spots/');
    const rows = page
      .getByRole('region', { name: 'Ranking de spots', exact: true })
      .locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    // o mount escreve o filtro no URL (syncGridFiltersToUrl): é o sinal de hidratação
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sport'), { timeout: 20_000 })
      .not.toBeNull();
    await expect(rows).toHaveCount(linhas);
  });

  test('«Limpar filtros» ausente num estado limpo e sai ao limpar', async ({ page }) => {
    await page.goto('/pt/spots/');
    const kitesurf = page.getByRole('button', { name: 'Kitesurf', exact: true }).first();
    await expect(kitesurf).toBeVisible({ timeout: 20_000 });
    const limpar = page.locator('[data-limpar-filtros]');
    // o estado inicial do /spots é o filtro por omissão: nada para limpar
    await expect(limpar).toHaveCount(0);

    await kitesurf.click();
    await expect(limpar).toBeVisible();
    await limpar.click();

    // «Limpar filtros» volta ao estado inicial (surf), não ao «Todos»
    await expect(limpar).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Surf', exact: true }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
