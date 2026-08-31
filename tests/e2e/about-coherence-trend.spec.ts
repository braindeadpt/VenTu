import { test, expect } from '@playwright/test';

/**
 * Secção de tendência de coerência ES×PT (About — data dashboard).
 *
 * Cliente de propósito (CoherenceTrendSection busca buoy-coherence-archive.json
 * em runtime, como a WaveBiasSection) para ser alternável de forma determinística.
 * Valida: barra empilhada por dia com veredictos e legenda quando o archive tem
 * dados; ausência da secção quando o ficheiro falta/404.
 */
const ARCHIVE = {
  fetchedAt: '2026-08-16T06:00:00.000Z',
  windowDays: 30,
  pairs: [
    { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'], hour: '2026-08-14T08', esHs: 1.6, ptHs: 1.5, date: '2026-08-14T08:30:00Z' },
    { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'], hour: '2026-08-14T09', esHs: 1.7, ptHs: 1.6, date: '2026-08-14T09:30:00Z' },
    { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'], hour: '2026-08-14T10', esHs: 1.6, ptHs: 1.7, date: '2026-08-14T10:30:00Z' },
    // Dia divergente (incoherent): n=3, mean|Δ| ~2.0.
    { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'], hour: '2026-08-15T08', esHs: 1.0, ptHs: 3.0, date: '2026-08-15T08:30:00Z' },
    { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'], hour: '2026-08-15T09', esHs: 1.1, ptHs: 3.2, date: '2026-08-15T09:30:00Z' },
    { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'], hour: '2026-08-15T10', esHs: 1.2, ptHs: 3.1, date: '2026-08-15T10:30:00Z' },
    // Outro par (Villano × Faro).
    { pair: 'Villano-Sisargas × Faro', codes: ['6200083', '6201079'], hour: '2026-08-14T08', esHs: 0.8, ptHs: 0.9, date: '2026-08-14T08:30:00Z' },
  ],
};

test.describe('About — tendência de coerência ES×PT', () => {
  test.use({ serviceWorkers: 'block' });

  test('mostra a barra empilhada por par com veredictos diários', async ({ page }) => {
    await page.route('**/data/buoy-coherence-archive.json', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ARCHIVE) });
    });

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });

    const section = page.locator('[data-coherence-trend-section="true"]');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section).toContainText('Tendência de coerência ES×PT');

    // Dois pares renderizados.
    const silleiro = section.locator('[data-coherence-pair="6200084|6201077"]');
    await expect(silleiro).toBeVisible();
    await expect(silleiro).toContainText('Cabo Silleiro × Porto');
    // Barra com segmentos (um por dia) — incoherent 15/08 destacado.
    await expect(section.locator('[data-coherence-bar="true"]')).toHaveCount(2);
    // Legenda global presente + count por veredicto.
    await expect(section).toContainText('Coerente');
    await expect(section).toContainText('Incoerente');
    await expect(section).toContainText('Revisão');
  });

  test('a secção não aparece quando o arquivo falta (404)', async ({ page }) => {
    await page.route('**/data/buoy-coherence-archive.json', (route) => route.fulfill({ status: 404 }));

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-coherence-trend-section="true"]')).toHaveCount(0);
    await expect(page.getByText('Tendência de coerência ES×PT')).toHaveCount(0);
  });
});