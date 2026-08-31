import { test, expect } from '@playwright/test';
import { readRealConditions } from './helpers/conditions';

/**
 * Aviso «Mar perigoso» — o mesmo de segurança do hero do spot, estendido ao
 * Dawn Patrol (strip no briefing) e ao card do spot no mapa (badge no chip).
 *
 * Apenas Agitação Marítima (sea state) abre o aviso; Vento não. O SW é
 * bloqueado para o page.route de warnings.json funcionar (padrão da suite).
 */

const SEA_STATE = {
  areaCode: 'LRA',
  areaLabel: 'Leiria',
  type: 'Agitação Marítima',
  level: 'orange',
  text: 'Ondulação de oeste com 4 a 5 metros',
  relevant: true,
  endTime: new Date(Date.now() + 12 * 3_600_000).toISOString(),
};

/** warnings.json com Agitação Marítima em TODOS os spots (determinístico). */
function warningsAllSeaState(): Record<string, unknown> {
  const spotWarnings: Record<string, unknown> = {};
  for (const id of Object.keys(readRealConditions())) {
    spotWarnings[id] = [SEA_STATE];
  }
  return {
    source: 'ipma',
    fetchedAt: new Date().toISOString(),
    warnings: [SEA_STATE],
    spotWarnings,
  };
}

/** warnings.json sem avisos de água (só Tempo Quente, irrelevante). */
function warningsNoSeaState(): Record<string, unknown> {
  return {
    source: 'ipma',
    fetchedAt: new Date().toISOString(),
    warnings: [],
    spotWarnings: {},
  };
}

async function interceptWarnings(page: import('@playwright/test').Page, body: Record<string, unknown>): Promise<void> {
  await page.route('**/data/warnings.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.describe('Mar perigoso — Dawn Patrol', () => {
  test.use({ serviceWorkers: 'block' });

  // O Dawn Patrol só renderiza na janela matinal (05–12h Lisboa) — congelar o
  // relógio do browser para o teste ser determinístico a qualquer hora do dia.
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.clock.setFixedTime(new Date('2026-08-15T08:00:00Z'));
  });

  test('Agitação Marítima activa → strip «Mar perigoso — não surfar» no briefing', async ({ page }) => {
    await interceptWarnings(page, warningsAllSeaState());
    await page.goto('/pt/');

    await expect(page.getByText('Mar perigoso — não surfar')).toBeVisible({ timeout: 20_000 });
    // O nível do aviso e a ligação ao spot afectado (spot em destaque).
    await expect(page.getByText(/Agitação marítima · Laranja/)).toBeVisible();
    const strip = page.getByText('Mar perigoso — não surfar').locator('..');
    await expect(strip).toHaveAttribute('href', /\/pt\/spots\/[^/]+\//);
  });

  test('sem Agitação Marítima → sem strip (Vento não abre o aviso)', async ({ page }) => {
    await interceptWarnings(page, warningsNoSeaState());
    await page.goto('/pt/');

    await expect(page.getByText('Mar perigoso — não surfar')).toHaveCount(0);
  });
});

test.describe('Mar perigoso — card do spot no mapa', () => {
  // Viewport móvel (≤767px) → o mapa abre o sheet do spot (MapSpotSheet).
  test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true });

  test('sheet do spot mostra o badge «Mar perigoso» quando há Agitação activa', async ({ page }) => {
    await interceptWarnings(page, warningsAllSeaState());
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu:windRingLegendSeen', '1');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

    await page.locator('.leaflet-marker-icon.spot-marker').first().click({ force: true });

    const sheet = page.getByTestId('map-spot-sheet');
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    // Badge «Mar perigoso» (sem o prefixo «Aviso:» para sea state).
    await expect(sheet.getByText('Mar perigoso')).toBeVisible();
  });

  test('sem Agitação → chip «Aviso:» ausente (nenhum aviso)', async ({ page }) => {
    await interceptWarnings(page, warningsNoSeaState());
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu:windRingLegendSeen', '1');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

    await page.locator('.leaflet-marker-icon.spot-marker').first().click({ force: true });

    const sheet = page.getByTestId('map-spot-sheet');
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Mar perigoso')).toHaveCount(0);
  });
});
