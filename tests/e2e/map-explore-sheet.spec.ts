import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptMapHours } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';

/**
 * Sheet explorar (mobile) + painel (desktop) — a lista sincronizada do /mapa.
 *
 * Provas exigidas pela implementação aprovada (variante A):
 *  1. MESMA FONTE DE SCORE — a linha da lista, o peek «Melhor agora» e o
 *     marcador mostram o mesmo número (getBestScore com a hora activa).
 *  2. «Melhor agora» = a linha do topo = o marcador de maior score na vista.
 *  3. Deep link ?spot= abre a lista com a linha correspondente focada.
 *  4. Atribuição (OSM/CARTO/Open-Meteo) sempre visível — dentro do sheet em
 *     TODOS os estados e no rodapé do painel desktop.
 *  5. A lista segue o viewport — um pan/zoom reordena/reduz as linhas.
 *  6. Teclado: ↑/↓ navegam entre linhas (roving tabindex).
 */

const SPORTS = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const;
const TIMES = Array.from({ length: 16 }, (_, i) => {
  const h = 8 + i * 3;
  const day = 3 + Math.floor(h / 24);
  return `2026-09-${String(day).padStart(2, '0')}T${String(h % 24).padStart(2, '0')}:00`;
});
const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: Object.fromEntries([
      ['best', TIMES.map((_, i) => (i === 3 ? 88 : 20))],
      ...SPORTS.map((s) => [s, TIMES.map((_, i) => (i === 3 ? 88 : 20))]),
    ]),
  },
};

async function openMapa(page: Page, query = '', debug = true): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript((dbg) => {
    localStorage.setItem('ventu.map.cluster', '0');
    if (dbg) localStorage.setItem('ventu.mapdebug', '1');
  }, debug);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

/**
 * Geometria real do ecrã: fração do mapa tapada pela moldura (sheet/painel)
 * e marcadores (spots ou clusters) cujo centro nasce debaixo dela. O teste
 * dos três estados só olhava para o atributo `data-explore-sheet` — um peek
 * do tamanho do sheet inteiro passava verde.
 */
async function chromeCoverage(page: Page, chromeSelector: string, edge: 'bottom' | 'left') {
  return page.evaluate(
    ({ sel, edge }) => {
      const c = document.querySelector('.leaflet-container')!.getBoundingClientRect();
      const ch = document.querySelector(sel)!.getBoundingClientRect();
      const covered = edge === 'bottom'
        ? (c.bottom - Math.max(ch.top, c.top)) / c.height
        : (Math.min(ch.right, c.right) - c.left) / c.width;
      const under = [...document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon')]
        .map((m) => {
          const r = m.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: m.getAttribute('aria-label') ?? '' };
        })
        .filter((p) => p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom)
        .filter((p) => (edge === 'bottom' ? p.y > ch.top : p.x < ch.right))
        .map((p) => p.name);
      return { covered, under };
    },
    { sel: chromeSelector, edge },
  );
}

/** Score de uma linha da lista (chip mono à esquerda). */
async function rowScore(row: ReturnType<Page['locator']>): Promise<number> {
  const txt = await row.locator('span').first().innerText();
  return Number(txt.trim());
}

/**
 * Mobile arranca sempre com cluster (readClusterPref ignora o localStorage
 * em <md) — para ler marcadores individuais há que desligar o agrupamento
 * pelo toggle real «Mostrar todos» no grupo «Ver também» do estado «half».
 */
async function unclusterMarkers(page: Page): Promise<void> {
  const sheet = page.locator('[data-explore-sheet]');
  if ((await sheet.getAttribute('data-explore-sheet')) === 'peek') {
    await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'half');
  }
  const toggle = page.getByRole('button', { name: /Mostrar todos|Show all/i });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();
  // A inserção chunked (8/batch) demora — espera marcadores individuais.
  await expect
    .poll(async () => page.locator('.leaflet-marker-icon.spot-marker').count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
}

test.describe('Lista sincronizada do /mapa — sheet mobile', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test('três estados por toque no grabber: peek → half → open → peek', async ({ page }) => {
    await openMapa(page);
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek');

    const grabber = page.locator('[data-sheet-grabber]');
    await grabber.click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'half');
    await grabber.click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open');
    await grabber.click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek');
  });

  test('peek deixa o mapa à vista e nenhum spot nasce debaixo do sheet', async ({ page }) => {
    await openMapa(page);
    await expect(page.locator('[data-explore-sheet]')).toHaveAttribute('data-explore-sheet', 'peek');
    // O peek mede-se por ResizeObserver: espera o snap assentar.
    await expect
      .poll(async () => (await chromeCoverage(page, '[data-explore-sheet]', 'bottom')).covered, { timeout: 10_000 })
      .toBeLessThan(0.4);
    const { under } = await chromeCoverage(page, '[data-explore-sheet]', 'bottom');
    expect(under, 'marcadores tapados pelo peek').toEqual([]);
  });

  test('«Melhor agora» = topo da lista = marcador de maior score na vista', async ({ page }) => {
    await openMapa(page);
    await unclusterMarkers(page);
    const sheet = page.locator('[data-explore-sheet]');
    // Voltar a peek para ler o «Melhor agora».
    await page.locator('[data-sheet-grabber]').click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open');
    await page.locator('[data-sheet-grabber]').click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek');

    const best = page.locator('[data-sheet-best]');
    await expect(best).toBeVisible({ timeout: 20_000 });
    const bestScore = Number((await best.locator('span').first().innerText()).trim());
    const bestName = await best.locator('.font-display').innerText();

    // O melhor score visível nos marcadores tem de bater certo.
    const maxMarker = await page.evaluate(() => {
      const scores = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.leaflet-marker-icon.spot-marker [data-spot-score]',
        ),
      ).map((el) => Number(el.getAttribute('data-spot-score')));
      return scores.length ? Math.max(...scores) : -1;
    });
    expect(bestScore).toBe(maxMarker);

    // E é a 1ª linha da lista no estado aberto, com o mesmo score e nome.
    await page.locator('[data-sheet-grabber]').click(); // half
    await page.locator('[data-sheet-grabber]').click(); // open
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open');
    const firstRow = page.getByRole('option').first();
    await expect(firstRow).toContainText(bestName);
    expect(await rowScore(firstRow)).toBe(bestScore);
  });

  test('linha e marcador partilham o score — inclusive na hora activa (48h)', async ({ page }) => {
    await interceptMapHours(page, MAP_HOURS_STUB);
    await openMapa(page, '?hours=1');
    // Sheet abre em «half» com ?hours=1 — desagrupa para ler o marcador.
    await unclusterMarkers(page);

    const markerScore = page.locator(
      '.leaflet-marker-icon.spot-marker[aria-label="Nazaré"] [data-spot-score]',
    );
    await expect(markerScore).toHaveAttribute('data-spot-score', '20', { timeout: 15_000 });

    // Sheet aberto → a linha da Nazaré mostra o MESMO 20 do marcador.
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'half', { timeout: 15_000 });
    await page.locator('[data-sheet-grabber]').click(); // → open
    const row = page.locator('[data-spot-id="nazare"]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await rowScore(row)).toBe(20);

    // Scrub para as 17h (índice 3) → marcador e linha sobem juntos para 88.
    // Ciclo do grabber: open → peek; o helper leva peek → half (scrubber).
    await page.locator('[data-sheet-grabber]').click(); // open → peek
    await expandMapHudFilters(page); // peek → half
    await page.locator('[data-map-hours-scrubber] input[type="range"]').fill('3');
    await expect(markerScore).toHaveAttribute('data-spot-score', '88', { timeout: 15_000 });
    await page.locator('[data-sheet-grabber]').click(); // half → open
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await rowScore(row)).toBe(88);
  });

  test('deep link ?spot= abre a lista com a linha focada', async ({ page }) => {
    await openMapa(page, '?spot=nazare');
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open', { timeout: 20_000 });
    const row = page.locator('[data-spot-id="nazare"]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toBeFocused();
  });

  test('a lista segue o viewport — zoom sobre o oeste reduz as linhas', async ({ page }) => {
    await openMapa(page);
    await page.locator('[data-sheet-grabber]').click(); // half
    await page.locator('[data-sheet-grabber]').click(); // open
    const rows = page.getByRole('option');
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);

    // Zoom sobre a Nazaré/Península — a lista tem de encolher para os
    // spots que ficam dentro dos novos bounds.
    const narrowed = await page.evaluate(async () => {
      const map = (window as any).__VENTU_MAP__;
      if (!map) return null;
      map.setView([39.6, -9.07], 11);
      await new Promise((r) => map.once('moveend', r));
      await new Promise((r) => setTimeout(r, 400));
      return document.querySelectorAll('[role="option"]').length;
    });
    expect(narrowed).not.toBeNull();
    expect(narrowed!).toBeLessThan(before);
    expect(narrowed!).toBeGreaterThan(0);
  });

  test('atribuição visível nos três estados do sheet', async ({ page }) => {
    await openMapa(page);
    const sheet = page.locator('[data-explore-sheet]');
    const attr = sheet.locator('[data-sheet-attribution]');
    await expect(attr).toBeVisible({ timeout: 20_000 });
    await expect(attr).toContainText(/OpenStreetMap|CARTO|Open-Meteo/);

    const grabber = page.locator('[data-sheet-grabber]');
    await grabber.click(); // half
    await expect(attr).toBeVisible();
    await grabber.click(); // open
    await expect(attr).toBeVisible();
  });

  test('teclado: ↑/↓ navegam entre linhas da lista', async ({ page }) => {
    await openMapa(page, '?spot=nazare');
    await expect(page.locator('[data-explore-sheet]')).toHaveAttribute(
      'data-explore-sheet', 'open', { timeout: 20_000 });
    const focused = page.locator('[data-spot-id="nazare"]');
    await expect(focused).toBeFocused();

    const idx = Number(await focused.getAttribute('data-row-index'));
    const last = (await page.getByRole('option').count()) - 1;
    // Se a linha focada for a última, sobe; senão desce.
    await page.keyboard.press(idx === last ? 'ArrowUp' : 'ArrowDown');
    const moved = page.locator('[data-explore-sheet] [role="option"]:focus');
    await expect(moved).toHaveAttribute(
      'data-row-index', String(idx === last ? last - 1 : idx + 1));
  });
});

test.describe('Lista sincronizada do /mapa — painel desktop', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test('nenhum spot nasce debaixo do painel aberto', async ({ page }) => {
    await openMapa(page);
    await expect(page.locator('[data-map-panel="open"]')).toBeVisible();
    const { under } = await chromeCoverage(page, '[data-map-panel="open"]', 'left');
    expect(under, 'marcadores tapados pelo painel').toEqual([]);
  });

  test('linhas ordenadas por score e iguais aos marcadores', async ({ page }) => {
    await openMapa(page);
    const panel = page.locator('[data-map-panel="open"]');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    const rows = panel.getByRole('option');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const scores: number[] = [];
    for (let i = 0; i < count; i += 1) {
      scores.push(await rowScore(rows.nth(i)));
    }
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
    // O topo do painel = maior score visível nos marcadores.
    const maxMarker = await page.evaluate(() => {
      const scores = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.leaflet-marker-icon.spot-marker [data-spot-score]',
        ),
      ).map((el) => Number(el.getAttribute('data-spot-score')));
      return scores.length ? Math.max(...scores) : -1;
    });
    expect(scores[0]).toBe(maxMarker);
  });

  test('clique numa linha abre o popup do marcador', async ({ page }) => {
    await openMapa(page);
    const row = page.locator('[data-map-panel] [data-spot-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(page.locator('.leaflet-popup')).toBeVisible({ timeout: 15_000 });
  });

  test('deep link ?spot= foca a linha no painel', async ({ page }) => {
    await openMapa(page, '?spot=nazare');
    const row = page.locator('[data-map-panel] [data-spot-id="nazare"]');
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toBeFocused();
  });

  test('atribuição no rodapé do painel (sempre visível)', async ({ page }) => {
    await openMapa(page);
    const attr = page.locator('[data-panel-attribution]');
    await expect(attr).toBeVisible({ timeout: 20_000 });
    await expect(attr).toContainText(/OpenStreetMap|CARTO|Open-Meteo/);
  });
});
