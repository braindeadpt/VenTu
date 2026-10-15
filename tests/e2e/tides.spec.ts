import { test, expect } from '@playwright/test';
import { alignClockToForecast, interceptForecasts } from './helpers/conditions';

/**
 * Marés — cartão «Maré» do Porquê (página de spot v6, #184).
 *
 * O antigo TideScheduleStrip («Agora» → cartão Maré) saiu da página com a
 * retirada dos duplicados: a maré da hora vive só no Porquê, lida do mesmo
 * objecto da hora (src/lib/horaSpot.ts) que a régua e a tabela do «Estudar o
 * spot». A fase (a encher / a vazar) e a próxima preia-mar/baixa-mar vêm da
 * curva horária `tideHeight` do forecast.
 *
 * Maré e lua (decisão do Pedro, 2026-10-15): voltam ao fim do «Estudar o
 * spot» (MedeSabeV6) a fase lunar, o regime (vivas / mortas), a amplitude do
 * dia e a tabela das marés seguintes — SEM o extremo que o Porquê já cita.
 */

async function abreEstudo(page: import('@playwright/test').Page) {
  const estudo = page.locator('#estudo');
  await expect(async () => {
    if ((await estudo.getAttribute('open')) === null) await estudo.locator('summary').click({ timeout: 3_000 });
    await expect(estudo).toHaveAttribute('open', '', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

const FASES = /Lua (nova|cheia|crescente|minguante)|Quarto (crescente|minguante)|Gibosa (crescente|minguante)/;

test.describe('Marés (Porquê v6)', () => {
  // O SW serve /data/* do cache e burla o page.route — ver helpers/conditions.ts.
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page }) => {
    await alignClockToForecast(page);
  });

  test('mostra a fase (a encher / a vazar) e a próxima preia-mar ou baixa-mar (hora PT: «5h46», «16h»)', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    const mare = page.locator('#porque-t ~ .fatores [data-fator="mare"]');
    await expect(mare).toBeVisible({ timeout: 20_000 });
    // Fase lida da curva horária (previsão), com a altura em metros.
    await expect(mare.locator('.val')).toContainText(/\d,\d\s*m · a (encher|vazar)/);
    // Próximo extremo da curva, na hora à portuguesa da v6 (hmTxt: «5h46», «16h»):
    // «preia-mar às 5h46 (2,5 m)» ou «baixa-mar às …».
    await expect(mare.locator('.rel')).toContainText(/(preia|baixa)-mar às ([01]?\d|2[0-3])h([0-5]\d)? \(\d,\d m\)/);
    // Uma só maré na página: o número da hora não se repete fora do Porquê
    // (a tabela do «Estudar o spot» está fechada por omissão).
    await expect(page.getByRole('status', { name: /Maré:/i })).toHaveCount(0);
  });

  test('sem tideHeight na curva → o cartão da maré diz «sem dados» (nunca inventa)', async ({ page }) => {
    await interceptForecasts(page, {
      spots: {
        guincho: (series) => series.map(({ tideHeight: _omit, ...h }) => h),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const mare = page.locator('#porque-t ~ .fatores [data-fator="mare"]');
    await expect(mare).toBeVisible({ timeout: 20_000 });
    await expect(mare.locator('.val')).toContainText('–');
    await expect(mare.locator('.rel')).toHaveText('sem dados');
    await expect(mare.getByText(/(preia|baixa)-mar às/)).toHaveCount(0);
  });

  test('Maré e lua com curva real → fase lunar, regime, amplitude hoje e a tabela sem repetir o Porquê', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    await abreEstudo(page);
    const lua = page.locator('#estudo [data-ec="mare-lua"]');
    await expect(lua).toBeVisible({ timeout: 20_000 });
    await expect(lua.getByText('Maré e lua')).toBeVisible();
    await expect(lua).toContainText(FASES);
    await expect(lua).toContainText(/Marés (vivas|mortas)|Transição/);
    await expect(lua.getByText(/Amplitude hoje: \d+,\d m/)).toBeVisible();
    // Tabela das marés seguintes: a do Porquê (a próxima) não se repete.
    const linhas = lua.locator('[data-ec="mares"] tr');
    expect(await linhas.count()).toBeGreaterThan(0);
    const citada = (await page.locator('#porque-t ~ .fatores [data-fator="mare"] .rel').innerText()).match(
      /(preia|baixa)-mar às (\S+) \((\d,\d) m\)/,
    );
    expect(citada).toBeTruthy();
    const textos = await linhas.allInnerTexts();
    for (const t of textos) {
      const mesmo = t.includes(citada![2]) && t.includes(`${citada![3]} m`) && t.startsWith(citada![1] === 'preia' ? 'Preia' : 'Baixa');
      expect(mesmo, `a maré do Porquê (${citada![0]}) repete-se na tabela: ${t}`).toBe(false);
    }
  });

  test('sem tideHeight na curva → Maré e lua só com a fase lunar (sem amplitude nem tabela)', async ({ page }) => {
    await interceptForecasts(page, {
      spots: {
        guincho: (series) => series.map(({ tideHeight: _omit, ...h }) => h),
      },
    });
    await page.goto('/pt/spots/guincho/');
    await abreEstudo(page);
    const lua = page.locator('#estudo [data-ec="mare-lua"]');
    await expect(lua).toBeVisible({ timeout: 20_000 });
    await expect(lua).toContainText(FASES);
    await expect(lua).toContainText(/Marés (vivas|mortas)|Transição/);
    await expect(lua.getByText(/Amplitude hoje:/)).toHaveCount(0);
    await expect(lua.locator('[data-ec="mares"]')).toHaveCount(0);
  });
});
