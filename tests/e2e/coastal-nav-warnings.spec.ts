import { test, expect } from '@playwright/test';
import {
  interceptCoastalNavWarnings,
  readRealConditions,
} from './helpers/conditions';

/**
 * Avisos à Navegação Costeiros (IH) — CoastalNavWarnings.
 *
 * The IH OGC API (nav_warning_coastal, keyless) is baked into
 * public/data/ih-coastal-warnings.json with a per-spot coverage map
 * (point-in-polygon). The spot page shows the block ONLY when the spot is
 * covered by a warning in force — never the empty section.
 *
 * These tests craft the file (deterministic — real warnings expire), so the
 * service worker must be blocked for page.route to apply.
 */

const FILE = {
  warnings: [
    {
      id: 18271,
      ref: 'ANAV NR 18271/26',
      category: 'Exercício militar',
      url: 'https://geoanavnet.hidrografico.pt/',
      // Área coberta — anel [lon, lat] como vem da OGC API (overlay no mapa).
      polygons: [
        [
          [-9.1, 38.66],
          [-9.06, 38.69],
          [-9.02, 38.66],
          [-9.05, 38.62],
          [-9.1, 38.66],
        ],
      ],
    },
    {
      id: 18265,
      ref: 'ANAV NR 18265/26',
      category: 'Requisitos de segurança maritima',
      url: '',
    },
    // «Avisos a los navegantes» espanhóis — mesma camada, source 'es'.
    {
      id: 9001,
      ref: 'AVISO 9001/26',
      category: 'Ejercicio naval',
      url: 'https://armada.defensa.gob.es/',
      source: 'es',
      polygons: [
        [
          [-9.12, 38.64],
          [-9.07, 38.67],
          [-9.04, 38.63],
          [-9.08, 38.6],
          [-9.12, 38.64],
        ],
      ],
    },
  ],
  coverage: { trafaria: [18271, 9001], troia: [18265] },
  fetchedAt: '2026-08-15T08:00:00Z',
  sourceCollection: 'nav_warning_coastal',
};

// Fixture com cobertura em TODOS os spots reais — o spot em destaque do Dawn
// Patrol (dawn-patrol.json) seja qual for, está coberto (slugs === ids).
const FILE_ALL_COVERED: Record<string, unknown> = (() => {
  const coverage: Record<string, number[]> = {};
  for (const id of Object.keys(readRealConditions())) coverage[id] = [18271];
  return { ...FILE, coverage };
})();

test.describe('Dawn Patrol — linha de segurança (Avisos à Navegação Costeiros)', () => {
  test.use({ serviceWorkers: 'block' });

  // O Dawn Patrol só renderiza na janela matinal (05–12h Lisboa) — congelar o
  // relógio do browser (mesmo padrão do mar-perigoso.spec).
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.clock.setFixedTime(new Date('2026-08-15T08:00:00Z'));
  });

  test('spot coberto → linha «Aviso à navegação costeira (IH)» junto da IPMA', async ({
    page,
  }) => {
    await interceptCoastalNavWarnings(page, FILE_ALL_COVERED);
    await page.goto('/pt/');

    const line = page.getByRole('link', {
      name: /Aviso à navegação costeira \(IH\)/,
    });
    await expect(line).toBeVisible({ timeout: 20_000 });
    await expect(line).toContainText('ANAV NR 18271/26');
    await expect(line).toContainText('Exercício militar');
    // Liga à página do spot afectado (onde a secção completa vive).
    await expect(line).toHaveAttribute('href', /\/pt\/spots\/[^/]+\//);
  });

  test('sem cobertura → sem linha costeira no briefing', async ({ page }) => {
    await interceptCoastalNavWarnings(page, { ...FILE, coverage: {} });
    await page.goto('/pt/');

    await expect(
      page.getByRole('link', { name: /Aviso à navegação costeira \(IH\)/ }),
    ).toHaveCount(0);
    // O briefing continua a renderizar (a falha da camada nunca o quebra).
    await expect(page.getByText(/Dawn Patrol/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Avisos à Navegação Costeiros (IH)', () => {
  test.use({ serviceWorkers: 'block' });

  test('spot coberto → bloco com ref, categoria, link de detalhe e fonte', async ({ page }) => {
    await interceptCoastalNavWarnings(page, FILE);
    await page.goto('/pt/spots/trafaria/');
    await expect(page.getByRole('heading', { level: 1, name: /Trafaria/i })).toBeVisible({
      timeout: 20_000,
    });

    const block = page.getByTestId('coastal-nav-warnings');
    await expect(block).toBeVisible({ timeout: 20_000 });
    await expect(block.getByText('Avisos à navegação costeira')).toBeVisible();
    await expect(block.getByText('ANAV NR 18271/26')).toBeVisible();
    await expect(block.getByText('Exercício militar')).toBeVisible();
    // Com avisos ES na fixture há dois «detalhe» (IH + ES) — o do IH basta.
    await expect(block.getByRole('link', { name: /detalhe/i }).first()).toBeVisible();
    await expect(
      block.getByText(/Instituto Hidrográfico · Avisos à Navegação Costeiros/),
    ).toBeVisible();
    // Navega para o /mapa fullscreen com a camada de avisos já ligada e
    // centrada na área coberta (deep link ?spot=<slug>).
    const mapLink = block.getByTestId('coastal-nav-warnings-map-link');
    await expect(mapLink).toBeVisible();
    await expect(block.getByText('Ver no mapa')).toBeVisible();
    await expect(mapLink).toHaveAttribute('href', '/pt/mapa/?spot=trafaria');
  });

  test('cross-border: avisos espanhóis «Avisos a los navegantes» na mesma secção', async ({
    page,
  }) => {
    await interceptCoastalNavWarnings(page, FILE);
    await page.goto('/pt/spots/trafaria/');
    await expect(page.getByRole('heading', { level: 1, name: /Trafaria/i })).toBeVisible({
      timeout: 20_000,
    });

    const block = page.getByTestId('coastal-nav-warnings');
    await expect(block).toBeVisible({ timeout: 20_000 });
    // Sub-bloco ES, separado do IH, com rótulo próprio e a ref espanhola.
    const esBlock = page.getByTestId('coastal-nav-warnings-es');
    await expect(esBlock).toBeVisible();
    await expect(esBlock.getByText('Avisos a los navegantes (ES, cross-border)')).toBeVisible();
    await expect(esBlock.getByText('AVISO 9001/26')).toBeVisible();
    await expect(esBlock.getByText('Ejercicio naval')).toBeVisible();
    await expect(esBlock.getByRole('link', { name: /detalhe/i })).toBeVisible();
    // O aviso IH continua no seu bloco, sem se misturar com o ES.
    await expect(block.getByText('ANAV NR 18271/26')).toBeVisible();
    // Mapa: o polígono ES também entra no overlay (mesma geometria).
    await expect(
      page.locator('.leaflet-container[data-coastal-polygons="true"]'),
    ).toHaveCount(1);
  });

  test('cross-border real no Minho: aviso ES a cobrir o Moledo do Minho com polígono no lado espanhol da foz', async ({
    page,
  }) => {
    // «Aviso a los navegantes» da Armada espanhola — polígono na margem
    // GALEGA da foz do Minho (A Guarda / Baixo Miño, lat 41.8–42.1, lon
    // -8.7–-9.0) que também cobre o Moledo do Minho (41.848, -8.863) do lado
    // PT — o cenário cross-border que o fetch IH calcula por point-in-polygon.
    await interceptCoastalNavWarnings(page, {
      warnings: [
        {
          id: 9101,
          ref: 'AVISO ES 9101/26',
          category: 'Ejercicio naval',
          url: 'https://armada.defensa.gob.es/',
          source: 'es',
          polygons: [
            [
              [-8.98, 42.05],
              [-8.75, 42.08],
              [-8.68, 41.95],
              [-8.78, 41.78],
              [-8.95, 41.8],
              [-8.98, 42.05],
            ],
          ],
        },
      ],
      coverage: { moledo: [9101] },
      fetchedAt: '2026-08-15T08:00:00Z',
      sourceCollection: 'nav_warning_coastal',
    });
    await page.goto('/pt/spots/moledo/');
    await expect(page.getByRole('heading', { level: 1, name: /Moledo/i })).toBeVisible({
      timeout: 20_000,
    });

    // A secção aparece (spot coberto), só com o sub-bloco ES — sem avisos IH.
    const block = page.getByTestId('coastal-nav-warnings');
    await expect(block).toBeVisible({ timeout: 20_000 });
    const esBlock = page.getByTestId('coastal-nav-warnings-es');
    await expect(esBlock).toBeVisible();
    await expect(esBlock.getByText('Avisos a los navegantes (ES, cross-border)')).toBeVisible();
    await expect(esBlock.getByText('AVISO ES 9101/26')).toBeVisible();
    await expect(esBlock.getByText('Ejercicio naval')).toBeVisible();
    await expect(esBlock.getByRole('link', { name: /detalhe/i })).toBeVisible();
    // Nenhum aviso do IH na fixture — a secção não inventa um bloco IH vazio.
    await expect(block.getByText(/ANAV NR/)).toHaveCount(0);

    // O overlay do mapa desenha o polígono ES (lado espanhol) que cobre o spot.
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('.leaflet-container[data-coastal-polygons="true"]'),
    ).toHaveCount(1);
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible({
      timeout: 15_000,
    });
    // Atribuição do IH no controlo (a camada costeira entra sempre com CC BY 4.0).
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      /Instituto Hidrográfico/,
      { timeout: 15_000 },
    );
  });

  test('spot coberto → overlay dos polígonos no mapa (área em aviso)', async ({ page }) => {
    await interceptCoastalNavWarnings(page, FILE);
    await page.goto('/pt/spots/trafaria/');
    await expect(page.getByRole('heading', { level: 1, name: /Trafaria/i })).toBeVisible({
      timeout: 20_000,
    });

    // O mapa da página (Leaflet) desenha o polígono do aviso que cobre o spot
    // (o atributo é posto no próprio container Leaflet quando há overlay).
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('.leaflet-container[data-coastal-polygons="true"]'),
    ).toHaveCount(1);
    // A atribuição do IH (CC BY 4.0) junta-se à do basemap no controlo.
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      /Instituto Hidrográfico/,
      { timeout: 15_000 },
    );
  });

  test('spot sem cobertura → bloco ausente e mapa sem polígonos', async ({ page }) => {
    await interceptCoastalNavWarnings(page, FILE);
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('coastal-nav-warnings')).toHaveCount(0);
    // Sem cobertura também não há sub-bloco ES.
    await expect(page.getByTestId('coastal-nav-warnings-es')).toHaveCount(0);
    // O mapa existe mas sem overlay de polígonos (spot sem cobertura).
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('.leaflet-container[data-coastal-polygons="true"]'),
    ).toHaveCount(0);
    // A secção de avisos (IPMA/radar) continua a renderizar.
    await expect(page.getByRole('heading', { name: /Avisos e radar/i })).toBeVisible();
  });

  test('ficheiro em falta (404) → bloco ausente sem quebrar a página', async ({ page }) => {
    await page.route('**/data/ih-coastal-warnings.json', (route) =>
      route.fulfill({ status: 404, body: 'nope' }),
    );
    await page.goto('/pt/spots/trafaria/');
    await expect(page.getByRole('heading', { level: 1, name: /Trafaria/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('coastal-nav-warnings')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Avisos e radar/i })).toBeVisible();
  });
});
