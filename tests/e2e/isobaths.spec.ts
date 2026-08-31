import { test, expect } from '@playwright/test';
import { interceptIsobaths } from './helpers/conditions';

/**
 * IsobathsStrip — «Fundo perto da praia» (IH depcnt_8_16_30).
 *
 * The strip reads spot-isobaths.json client-side and shows the distance from
 * the beach to the nearest 8/16/30 m depth contour. Renders nothing when the
 * spot has no nearby contour or the file is missing.
 */

test.describe('IsobathsStrip (Fundo perto da praia)', () => {
  test.use({ serviceWorkers: 'block' });

  const NAZARE_ISOBATHS = {
    spots: { nazare: { 8: 0.25, 16: 0.31, 30: 0.46 } },
    fetchedAt: '2026-08-15T08:00:00Z',
    sourceCollection: 'depcnt_8_16_30',
    depths: [8, 16, 30],
  };

  test('mostra as distâncias às isóbatas 8/16/30 m no dashboard do spot', async ({ page }) => {
    await interceptIsobaths(page, NAZARE_ISOBATHS);
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    const strip = page.getByTestId('isobaths-strip');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    await expect(strip.getByText('Fundo perto da praia')).toBeVisible();
    // Distâncias em metros (< 1 km) — Nazaré funde rápido.
    await expect(strip.getByText('250 m')).toBeVisible();
    await expect(strip.getByText('310 m')).toBeVisible();
    await expect(strip.getByText('460 m')).toBeVisible();
    // Atribuição honesta.
    await expect(strip.getByText(/Isóbatas IH \(CC-BY 4\.0\)/)).toBeVisible();
  });

  test('spot sem contornos próximos → o strip não aparece', async ({ page }) => {
    // O spot existe no ficheiro mas sem nenhuma profundidade dentro do raio.
    await interceptIsobaths(page, {
      spots: { nazare: {} },
      fetchedAt: '2026-08-15T08:00:00Z',
      sourceCollection: 'depcnt_8_16_30',
      depths: [8, 16, 30],
    });
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('isobaths-strip')).toHaveCount(0);
  });

  test('ficheiro ausente (404) → o strip não aparece e a página não quebra', async ({ page }) => {
    await page.route('**/data/spot-isobaths.json', async (route) => route.fulfill({ status: 404 }));
    await page.goto('/pt/spots/nazare/');
    await expect(page.getByRole('heading', { level: 1, name: /Nazaré/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('isobaths-strip')).toHaveCount(0);
  });
});
