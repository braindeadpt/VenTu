import { test, expect } from '@playwright/test';

/**
 * Dawn Patrol — score recalibrado no HERO do banner.
 *
 * O cartão principal (hero, colapsado) mostra agora o score recalibrado do
 * spot em destaque (topScore do dawn-patrol.json) com sufixo honesto:
 *   - «(boia)»        — leitura fresca recalibrou o score (topScoreSource 'boia');
 *   - «(viés regional)» — meta waveBias da pipeline (topScoreSource 'viés regional');
 *   - sem sufixo       — previsão pura (sem recalibração).
 * O tooltip do sufixo tem a MESMA explicação dos vereditos expandidos
 * (boia X + previsão original), partilhada via recalibrationTitle.
 *
 * Fixture determinística — o dawn-patrol.json é interceptado (o real não tem
 * leituras frescas); o service worker é bloqueado para o page.route aplicar.
 * Relógio congelado na janela matinal (08:00Z, igual ao coastal-nav-warnings).
 */

function dawnPatrolFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '2026-08-15',
    generatedAt: '2026-08-15T08:00:00Z',
    topSpot: 'Guincho',
    topSpotSlug: 'guincho',
    topScore: 78,
    topScoreForecast: 64,
    topScoreSource: 'boia',
    topScoreMeta: { stationName: 'CSA92/D', distanceKm: 60 },
    pt: {
      headline: 'Bom dia de ondas na costa sul',
      advice: 'Vento fraco de norte, swell consistente.',
      bestTime: '09:00–11:00',
      wetsuit: '3/2 mm',
      crowdTip: 'Pouca gente durante a semana.',
    },
    en: {
      headline: 'Good morning surf on the south coast',
      advice: 'Light north wind, consistent swell.',
      bestTime: '09:00–11:00',
      wetsuit: '3/2 mm',
      crowdTip: 'Quiet during the week.',
    },
    spots: [],
    ...overrides,
  };
}

test.describe('Dawn Patrol — score recalibrado no hero', () => {
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.clock.setFixedTime(new Date('2026-08-15T08:00:00Z'));
  });

  test('boia fresca → hero mostra «Score: 78» com sufixo «(boia)» e tooltip da previsão', async ({
    page,
  }) => {
    await page.route('**/data/dawn-patrol.json', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(dawnPatrolFixture()) });
    });
    await page.goto('/pt/');

    const scoreLine = page.getByText(/Score:/i).first();
    await expect(scoreLine).toBeVisible({ timeout: 20_000 });
    await expect(scoreLine).toContainText('78');
    // Sufixo honesto — a boia recalibrou o score.
    const suffix = scoreLine.getByText('(boia)');
    await expect(suffix).toBeVisible();
    // Tooltip com a explicação partilhada com os vereditos (boia + previsão).
    await expect(suffix).toHaveAttribute(
      'title',
      /Score corrigido pela boia CSA92\/D \(previsão: 64\)/,
    );
  });

  test('viés regional → sufixo «(viés regional)» com a região no tooltip', async ({ page }) => {
    await page.route('**/data/dawn-patrol.json', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          dawnPatrolFixture({
            topScoreSource: 'viés regional',
            topScoreMeta: { region: 'Cascais', me: 0.4, n: 40 },
          }),
        ),
      });
    });
    await page.goto('/pt/');

    const scoreLine = page.getByText(/Score:/i).first();
    await expect(scoreLine).toBeVisible({ timeout: 20_000 });
    await expect(scoreLine).toContainText('78');
    const suffix = scoreLine.getByText('(viés regional)');
    await expect(suffix).toBeVisible();
    await expect(suffix).toHaveAttribute(
      'title',
      /Score corrigido pelo viés regional \(Cascais\) \(previsão: 64\)/,
    );
  });

  test('previsão pura → score no hero sem sufixo (nada inventado)', async ({ page }) => {
    await page.route('**/data/dawn-patrol.json', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          dawnPatrolFixture({
            topScoreSource: 'previsão',
            topScoreMeta: null,
          }),
        ),
      });
    });
    await page.goto('/pt/');

    const scoreLine = page.getByText(/Score:/i).first();
    await expect(scoreLine).toBeVisible({ timeout: 20_000 });
    await expect(scoreLine).toContainText('78');
    await expect(scoreLine.getByText(/\(boia\)|\(viés regional\)|\(buoy\)|\(regional bias\)/)).toHaveCount(0);
  });
});
