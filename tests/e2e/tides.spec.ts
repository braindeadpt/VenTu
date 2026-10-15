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
 */

test.describe('Marés (Porquê v6)', () => {
  // O SW serve /data/* do cache e burla o page.route — ver helpers/conditions.ts.
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page }) => {
    await alignClockToForecast(page);
  });

  test('mostra a fase (a encher / a vazar) e a próxima preia-mar ou baixa-mar (HH:MM)', async ({ page }) => {
    await page.goto('/pt/spots/guincho/');
    const mare = page.locator('#porque-t ~ .fatores [data-fator="mare"]');
    await expect(mare).toBeVisible({ timeout: 20_000 });
    // Fase lida da curva horária (previsão), com a altura em metros.
    await expect(mare.locator('.val')).toContainText(/\d,\d\s*m · a (encher|vazar)/);
    // Próximo extremo da curva: «preia-mar às HH:MM (x,x m)» ou «baixa-mar às …».
    await expect(mare.locator('.rel')).toContainText(/(preia|baixa)-mar às \d{2}:\d{2} \(\d,\d m\)/);
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
});
