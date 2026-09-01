import { test, expect } from '@playwright/test';

/**
 * Camada «Avisos à navegação (IH)» no mapa fullscreen (/mapa): o toggle do HUD
 * desenha os polígonos de TODOS os avisos activos (não só os do spot), com
 * popup ligado ao detalhe oficial. Off por omissão, lazy e degrada sem dados.
 */

/** Dois avisos com polígonos reais: um na zona da Nazaré (PT) e outro ES na
 *  margem galega da foz do Minho (cobre o Moledo). Coverage é irrelevante aqui
 *  — a camada do /mapa desenha TUDO o que tiver polígonos. */
const IH_DETAIL_URL =
  'https://geoanavnet.hidrografico.pt/coastal-warnings?uuid=dd021968-f823-4dd2-8d60-695ad66f5311';

const COASTAL_FIXTURE = {
  warnings: [
    {
      id: 1670,
      ref: 'ANAV NR 1670/26',
      category: 'Requisitos de segurança maritima',
      url: IH_DETAIL_URL,
      source: 'ih',
      polygons: [[[-9.2, 39.5], [-9.05, 39.55], [-9.0, 39.6], [-9.15, 39.62]]],
    },
    {
      id: 9101,
      ref: 'AVISO ES 9101/26',
      category: 'Ejercicio naval',
      url: 'https://armada.defensa.gob.es/avisos/9101',
      source: 'es',
      polygons: [[[-8.98, 41.78], [-8.7, 41.9], [-8.68, 42.08], [-8.95, 42.05]]],
    },
  ],
  coverage: { moledo: [9101], nazare: [1670] },
  fetchedAt: '2026-08-31T08:00:00Z',
  sourceCollection: 'nav_warning_coastal',
};

async function interceptCoastalWarnings(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/data/ih-coastal-warnings.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(COASTAL_FIXTURE),
    });
  });
}

test.describe('Avisos à navegação (IH) — camada no mapa fullscreen (/mapa)', () => {
  test.use({ serviceWorkers: 'block' });

  test('toggle desenha os polígonos de TODOS os avisos e abre o popup de detalhe', async ({
    page,
  }) => {
    // O coach de primeira visita dos anéis de vento abre um modal sobre o mapa
    // e intercepta o clique no polígono — marcá-lo como visto evita a corrida.
    await page.addInitScript((key) => localStorage.setItem(key, '1'), 'ventu:windRingLegendSeen');
    await interceptCoastalWarnings(page);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    // Off por omissão — sem overlay nem atribuição.
    const toggle = page.getByRole('button', { name: 'Avisos à navegação (IH)' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.leaflet-container[data-coastal-warnings="true"]')).toHaveCount(0);

    await toggle.click();

    // O aria-label muda ao ligar (show → hide) — re-consultar pelo novo nome.
    const active = page.getByRole('button', { name: 'Ocultar avisos à navegação' });
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');

    // Polígonos dos DOIS avisos (IH + ES) desenhados no pane de overlays.
    await expect(
      page.locator('.leaflet-container[data-coastal-warnings="true"]'),
    ).toHaveCount(1);
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible({
      timeout: 15_000,
    });
    // Atribuição do IH (CC BY 4.0) junta-se à do basemap.
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      /Avisos à Navegação Costeiros © Instituto Hidrográfico/,
      { timeout: 15_000 },
    );

    // Tooltip ligado ao detalhe oficial (geoanavnet.hidrografico.pt): o tooltip
    // do polígono é um link clicável com ref + categoria. dispatchEvent
    // 'mouseover' no path abre o tooltip sticky (Leaflet escuta no elemento).
    await page.locator('.leaflet-overlay-pane path').first().dispatchEvent('mouseover');
    const tooltipLink = page.locator('.leaflet-tooltip-pane .leaflet-tooltip a');
    await expect(tooltipLink).toBeVisible({ timeout: 10_000 });
    await expect(tooltipLink).toContainText('ANAV NR 1670/26');
    await expect(tooltipLink).toContainText('Requisitos de segurança maritima');
    await expect(tooltipLink).toHaveAttribute('href', IH_DETAIL_URL);

    // Clique no polígono abre o aviso no geoanavnet (nova aba): o handler
    // chama window.open com o URL de detalhe — interceptado para validar o
    // wiring sem depender do popup-blocker do browser (dispatchEvent é um
    // evento sintético, sem user activation para abrir uma tab real).
    await page.evaluate(() => {
      (window as any).__ventuOpenedUrl = null;
      window.open = (url?: string) => {
        (window as any).__ventuOpenedUrl = url ?? null;
        return null as any;
      };
    });
    await page.locator('.leaflet-overlay-pane path').first().dispatchEvent('click');
    await expect
      .poll(() => page.evaluate(() => (window as any).__ventuOpenedUrl))
      .toBe(IH_DETAIL_URL);

    // Desligar remove o overlay e a marcação.
    await active.click();
    await expect(page.getByRole('button', { name: 'Avisos à navegação (IH)' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.leaflet-container[data-coastal-warnings="true"]')).toHaveCount(0);
  });

  test('preferência persistida é restaurada no /mapa', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '1'), 'ventu.map.coastalWarnings');
    await interceptCoastalWarnings(page);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const active = page.getByRole('button', { name: 'Ocultar avisos à navegação' });
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('.leaflet-container[data-coastal-warnings="true"]'),
    ).toHaveCount(1);
  });

  test('sem avisos com polígonos → o toggle liga mas não desenha nada', async ({ page }) => {
    await page.route('**/data/ih-coastal-warnings.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          warnings: [{ id: 1, ref: 'ANAV NR 1/26', category: 'x', url: '', source: 'ih' }],
          coverage: {},
          fetchedAt: '2026-08-31T08:00:00Z',
          sourceCollection: 'nav_warning_coastal',
        }),
      });
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const toggle = page.getByRole('button', { name: 'Avisos à navegação (IH)' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Ocultar avisos à navegação' })).toBeVisible({
      timeout: 15_000,
    });
    // Sem polígonos → o mapa não fica marcado (o toggle fica activo, honesto).
    await expect(page.locator('.leaflet-container[data-coastal-warnings="true"]')).toHaveCount(0);
  });

  test('ficheiro ausente (404) → o mapa intacto sem overlay', async ({ page }) => {
    await page.route('**/data/ih-coastal-warnings.json', async (route) =>
      route.fulfill({ status: 404, body: 'nope' }),
    );
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const toggle = page.getByRole('button', { name: 'Avisos à navegação (IH)' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Ocultar avisos à navegação' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.leaflet-container[data-coastal-warnings="true"]')).toHaveCount(0);
  });
});

test.describe('Avisos à navegação — deep link ?spot= (de um spot com aviso activo)', () => {
  test.use({ serviceWorkers: 'block' });

  test('?spot= de um spot coberto → liga a camada automaticamente e desenha os polígonos', async ({
    page,
  }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '1'), 'ventu:windRingLegendSeen');
    await interceptCoastalWarnings(page);
    await page.goto('/pt/mapa/?spot=moledo', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const active = page.getByRole('button', { name: 'Ocultar avisos à navegação' });
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    // A camada foi ligada por deep link e desenha os polígonos (incl. o ES que
    // cobre o Moledo) com a atribuição IH.
    await expect(page.locator('.leaflet-container[data-coastal-warnings="true"]')).toHaveCount(1);
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      /Avisos à Navegação Costeiros © Instituto Hidrográfico/,
      { timeout: 15_000 },
    );
  });

  test('?spot= de um spot SEM aviso → a camada fica desligada (comportamento por omissão)', async ({
    page,
  }) => {
    await interceptCoastalWarnings(page);
    await page.goto('/pt/mapa/?spot=guincho', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const toggle = page.getByRole('button', { name: 'Avisos à navegação (IH)' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.leaflet-container[data-coastal-warnings="true"]')).toHaveCount(0);
  });
});
