import { test, expect } from '@playwright/test';
import { interceptConditions, interceptForecasts } from './helpers/conditions';

/**
 * Marés — TideScheduleStrip.
 *
 * The tide phase label comes from conditions.json[spot].tideStatus (phase
 * override in buildTideSchedule); the next low/high times come from the
 * hourly tideHeight curve in forecasts.json (real build data has 168h with
 * tideHeight). We transform only the per-spot conditions entry via the shared
 * helper — deterministic phases without touching the forecast.
 */

test.describe('Marés (TideScheduleStrip)', () => {
  // O SW serve /data/* do cache e burla o page.route — ver helpers/conditions.ts.
  test.use({ serviceWorkers: 'block' });

  test('mostra a fase a subir com a Baixa/Alta seguintes (HH:MM)', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        guincho: (entry) => ({ ...entry, tideStatus: 'rising' }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const strip = page.getByRole('status', { name: /Maré: Maré a subir/i });
    await expect(strip).toBeVisible({ timeout: 20_000 });
    // Próximas marés vêm da curva horária real (previsão).
    await expect(strip).toContainText('Baixa');
    await expect(strip).toContainText('Alta');
    await expect(strip.getByText(/\d{2}:\d{2}/).first()).toBeVisible();
  });

  test('mostra «Maré alta agora» quando tideStatus é high', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        guincho: (entry) => ({ ...entry, tideStatus: 'high' }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('status', { name: /Maré: Maré alta agora/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('status', { name: /Maré: Maré alta agora/i })).toContainText('Baixa');
  });

  test('mostra «Maré a descer» quando tideStatus é falling', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        guincho: (entry) => ({ ...entry, tideStatus: 'falling' }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('status', { name: /Maré: Maré a descer/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('sem tideHeight na curva → schedule ausente (strip some) e MoonTideCard sem amplitude', async ({
    page,
  }) => {
    // buildTideSchedule devolve null quando a série tem <2 pontos com
    // tideHeight — o card de marés (TideScheduleStrip) não renderiza, mas o
    // MoonTideCard continua (fase lunar) sem a linha de amplitude.
    await interceptForecasts(page, {
      spots: {
        guincho: (series) =>
          series.map(({ tideHeight: _omit, ...h }) => h),
      },
    });

    await page.goto('/pt/spots/guincho/');

    // Sem schedule: nem o strip nem o título «Marés (previsão)» aparecem.
    await expect(page.getByRole('status', { name: /Maré:/i })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText('Marés (previsão)')).toHaveCount(0);

    // MoonTideCard continua visível (fase lunar), mas sem amplitude.
    const moonCard = page.getByText('Maré e lua').locator('..');
    await expect(moonCard).toBeVisible();
    // Fase lunar real do build (qualquer das 8 fases em pt).
    await expect(moonCard).toContainText(
      /Lua (nova|cheia|crescente|minguante)|Quarto (crescente|minguante)|Gibosa (crescente|minguante)/,
    );
    await expect(moonCard).toContainText(/Marés (vivas|mortas)|Transição/);
    await expect(moonCard.getByText(/Amplitude hoje:/)).toHaveCount(0);
  });

  test('MoonTideCard com curva real → mostra fase lunar, regime e amplitude hoje', async ({
    page,
  }) => {
    // Sem transform: o forecast real do build tem tideHeight → a amplitude
    // do dia é calculada (≥2 pontos) e o card mostra fase + regime + range.
    await page.goto('/pt/spots/guincho/');

    const moonCard = page.getByText('Maré e lua').locator('..');
    await expect(moonCard).toBeVisible({ timeout: 20_000 });
    // Fase lunar real do build (qualquer das 8 fases em pt).
    await expect(moonCard).toContainText(
      /Lua (nova|cheia|crescente|minguante)|Quarto (crescente|minguante)|Gibosa (crescente|minguante)/,
    );
    await expect(moonCard).toContainText(/Marés (vivas|mortas)|Transição/);
    // Amplitude real do build (série 168h com tideHeight) — número sempre ≥ 0.
    await expect(moonCard.getByText(/Amplitude hoje: \d+\.\d m/)).toBeVisible();
  });
});
