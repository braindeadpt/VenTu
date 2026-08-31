import { test, expect } from '@playwright/test';
import { interceptConditions } from './helpers/conditions';

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
});
