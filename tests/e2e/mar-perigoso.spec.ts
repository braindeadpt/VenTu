import { test, expect } from '@playwright/test';
import { interceptWarnings, readRealConditions } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';

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

/**
 * Abre o sheet do spot tocando num marker individual.
 *
 * O mapa móvel desenha os markers por chunks (runChunked, 8/batch + yield) e
 * faz fitBounds ao primeiro batch — os icons mexem-se logo depois de aparecer.
 * Um click({ force: true }) logo após o waitForSelector dispara numa posição
 * pré-fitBounds e pode cair no fundo do mapa (flake sob workers paralelos).
 * Aqui o clique é SEM force: o Playwright espera o marker estabilizar (2 frames
 * com a mesma caixa) antes de acertar, e retries enquanto os chunks chegam.
 * `.spot-marker` só casa singletons (não clusters), por isso qualquer one abre
 * o sheet; um sheet reopenável é o contrato do MapSpotSheet.
 */
async function openSpotSheet(page: import('@playwright/test').Page) {
  await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
  const marker = page.locator('.leaflet-marker-icon.spot-marker').first();
  // Primeiro forçamos o scroll/estabilidade do target; o click() em si já o faz.
  await marker.click();
  const sheet = page.getByTestId('map-spot-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return sheet;
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
    // O rótulo usa o MESMO warningBadgeLabel das restantes superfícies
    // («Mar perigoso», não «Agitação marítima») + o nível, e a ligação leva ao
    // spot afectado (spot em destaque).
    await expect(page.getByText(/Mar perigoso · Laranja/)).toBeVisible();
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
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });

    const sheet = await openSpotSheet(page);
    // Badge «Mar perigoso» (sem o prefixo «Aviso:» para sea state).
    await expect(sheet.getByText('Mar perigoso')).toBeVisible({ timeout: 15_000 });
    // Tooltip do chip (MapSpotPreview) com o nível localizado, não só o rótulo.
    const chip = sheet.locator('[title*="Aviso IPMA: Mar perigoso (Laranja)"]');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toHaveAttribute('title', /Aviso IPMA: Mar perigoso \(Laranja\)/);
  });

  test('sem Agitação → chip «Aviso:» ausente (nenhum aviso)', async ({ page }) => {
    await interceptWarnings(page, warningsNoSeaState());
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });

    const sheet = await openSpotSheet(page);
    await expect(sheet.getByText('Mar perigoso')).toHaveCount(0);
  });
});

test.describe('Mar perigoso — tooltip do chip nos cards', () => {
  test.use({ serviceWorkers: 'block' });

  test('TopNow: o chip do SpotListCard tem o nível localizado no tooltip', async ({ page }) => {
    await interceptWarnings(page, warningsAllSeaState());
    await page.goto('/pt/');

    // O chip de aviso do card da homepage (SpotListCard → WarningPill) mostra
    // o nível localizado no tooltip, não só o rótulo «Mar perigoso».
    const chip = page.locator('[title*="Aviso IPMA: Mar perigoso (Laranja)"]').first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await expect(chip).toContainText('Mar perigoso');
    await expect(chip).toHaveAttribute('title', /Aviso IPMA: Mar perigoso \(Laranja\)/);
  });

  test('TopNow EN: tooltip «IPMA warning: Dangerous sea (Orange)» no card', async ({ page }) => {
    await interceptWarnings(page, warningsAllSeaState());
    await page.goto('/en/');

    const chip = page.locator('[title*="IPMA warning: Dangerous sea (Orange)"]').first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await expect(chip).toContainText('Dangerous sea');
    await expect(chip).toHaveAttribute('title', /IPMA warning: Dangerous sea \(Orange\)/);
  });
});
