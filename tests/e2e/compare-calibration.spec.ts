import { test, expect } from '@playwright/test';

/**
 * Tag de calibração cross-border no comparador de spots.
 *
 * O CompareClient busca /data/conditions.json EM RUNTIME (client-side, com
 * cache: 'no-store'), por isso — ao contrário do TopNow, que é SSG puro — a
 * injecção via page.route é determinística: dá para forçar uma boia ES
 * recalibrada à referência PT e validar o tag compacto «ref. PT» junto da
 * altura, onde o score aparece sem o contexto do card/hero.
 *
 * Contrato: o tag só existe no card do spot cuja leitura foi recalibrada
 * (calibration em observedWave) — o spot sem leitura não mostra o tag.
 */
const NOW = new Date().toISOString();

const CONDITIONS = {
  guincho: {
    waveHeight: 1.4, // recalibrado pelo merge: 2.3 + ME −0.9
    waveHeightRaw: 2.3,
    wavePeriod: 10,
    waveDirection: 280,
    windSpeed: 12,
    windDirection: 320,
    windGust: 16,
    waterTemp: 17,
    updatedAt: NOW,
    observedWave: {
      waveHeight: 1.4,
      wavePeriod: 10,
      waveDirection: 280,
      stationName: 'Cabo Silleiro',
      stationArea: 'Galiza',
      distanceKm: 96.8,
      observedAt: NOW,
      source: 'wmo-buoy',
      calibration: {
        me: -0.9,
        n: 4,
        verdict: 'review',
        from: 'Cabo Silleiro × Datawell ao largo de Faro',
        rawHeight: 2.3,
        deltaM: -0.9,
      },
    },
    observedWaveAlt: null,
    observedWaveMeta: {
      winner: 'wmo',
      reason: 'wmo-only',
      ihAgeHours: null,
      wmoAgeHours: 1,
      ihDistanceKm: null,
      wmoDistanceKm: 96.8,
    },
  },
  // Sem leitura observada → sem correcção e sem tag.
  moledo: {
    waveHeight: 1.2,
    waveHeightRaw: 1.2,
    wavePeriod: 9,
    waveDirection: 300,
    windSpeed: 10,
    windDirection: 340,
    windGust: 14,
    waterTemp: 16,
    updatedAt: NOW,
  },
};

test.describe('Comparador — tag de calibração cross-border', () => {
  test.use({ serviceWorkers: 'block' });

  test('card do spot recalibrado mostra «ref. PT» junto da altura; o spot sem leitura não', async ({
    page,
  }) => {
    await page.route('**/data/conditions.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CONDITIONS),
      });
    });

    await page.goto('/pt/compare/?spots=guincho,moledo', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    const guinchoCard = page.locator('article', { hasText: 'Guincho' }).first();
    await expect(guinchoCard).toBeVisible({ timeout: 20_000 });

    // Altura recalibrada com sufixo da origem (boia).
    await expect(guinchoCard.getByText(/1\.4m\s*\(boia\)/)).toBeVisible();

    // Tag compacto de calibração cross-border (mesmo pill do hero/sticky).
    const tag = guinchoCard.locator('[data-wave-calibrated="compact"]');
    await expect(tag).toBeVisible();
    await expect(tag).toContainText('ref. PT (-0.9 m · n=4)');
    await expect(tag).toHaveAttribute(
      'title',
      /Leitura espanhola recalibrada para a referência PT \(Cabo Silleiro × Datawell ao largo de Faro\) · ME -0\.9 m \(n=4\)/,
    );

    // O card do spot sem leitura não mostra o tag — exactamente um no ecrã.
    const moledoCard = page.locator('article', { hasText: /Moledo do Minho/ });
    await expect(moledoCard).toBeVisible();
    await expect(moledoCard.locator('[data-wave-calibrated="compact"]')).toHaveCount(0);
    await expect(page.locator('[data-wave-calibrated="compact"]')).toHaveCount(1);
  });

  // Contexto touch explícito (hasTouch) para o tap simular toque real.
  test.describe('mobile (hasTouch)', () => {
    test.use({
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });

    test('mobile: tap no chip abre o popover da calibração (sem depender de hover)', async ({
      page,
    }) => {
    // No mobile não há hover — o title nativo é invisível. O chip é agora um
    // botão real: tocar abre um popover (portal para <body>, nunca cortado
    // por overflow) com a cadeia completa; fecha com clique fora ou Escape.
    await page.route('**/data/conditions.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CONDITIONS),
      });
    });

    await page.goto('/pt/compare/?spots=guincho,moledo', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    const guinchoCard = page.locator('article', { hasText: 'Guincho' }).first();
    await expect(guinchoCard).toBeVisible({ timeout: 20_000 });

    const chip = guinchoCard.locator('[data-wave-calibrated="compact"]');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');

    // Tap no chip → popover com a cadeia completa (par, ME, raw → corrigida).
    await chip.tap();
    const popover = page.locator('[data-wave-calibration-popover="true"]');
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(popover).toContainText('Cabo Silleiro × Datawell ao largo de Faro');
    await expect(popover).toContainText('ME -0.9 m (n=4)');
    await expect(popover).toContainText('2.3 m → 1.4 m');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');

    // Clique fora → fecha (e o aria-expanded volta a false).
    await page.mouse.click(20, 90);
    await expect(popover).toBeHidden();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');

    // Reabre para provar o escape (fecha com Escape, acessibilidade).
    await chip.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    });
  });

  test('EN: o tag aparece traduzido no comparador', async ({ page }) => {
    await page.route('**/data/conditions.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CONDITIONS),
      });
    });

    await page.goto('/en/compare/?spots=guincho,moledo', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    const guinchoCard = page.locator('article', { hasText: 'Guincho' }).first();
    await expect(guinchoCard).toBeVisible({ timeout: 20_000 });

    const tag = guinchoCard.locator('[data-wave-calibrated="compact"]');
    await expect(tag).toBeVisible();
    await expect(tag).toContainText('PT ref (-0.9 m · n=4)');
    await expect(tag).toHaveAttribute(
      'title',
      /Spanish reading recalibrated to the PT reference/,
    );
  });
});