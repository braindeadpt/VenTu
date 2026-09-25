import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptIhBuoys } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';

/**
 * Aceitação MAP-UX-V3 §5 — painel «Explorar» desktop + sheet mobile.
 * Provas novas em cima do contrato já coberto por map-explore-sheet.spec.ts:
 *  - painel 360 px / rail 56 px com contagem vertical;
 *  - filtros com rótulo visível: segmented que quebra, selects Região/Nível,
 *    switches «Só a bombar»/«Agrupar spots», chips removíveis + «Limpar»;
 *  - peek = 136 ± 4 px com duas linhas de leitura;
 *  - gesto: seguimento 1:1 (erro ≤2 px a meio) e flick para cima → open;
 *  - nomes de spot nunca truncados (lista e peek);
 *  - teclado ↑/↓/Enter abre a pré-visualização do spot.
 */

const FRESH_ISO = new Date().toISOString();
const IH_FRESH = {
  fetchedAt: FRESH_ISO,
  apiKeyConfigured: true,
  hasWaveData: true,
  stations: { stub: { status: 'active', latest: { date: FRESH_ISO } } },
};

async function openMapa(page: Page, query = ''): Promise<void> {
  // Camada de boias saudável → sem chip/linha de aviso no peek.
  await interceptIhBuoys(page, IH_FRESH);
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.mapdebug', '1');
  });
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

/**
 * Altura visível do sheet: da borda de cima até ao fundo do contentor do
 * mapa menos o inset `bottom-2` (8 px). Mede-se contra `.leaflet-container`
 * — a mesma régua dos testes de cobertura do chrome.
 */
async function sheetVisibleHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-explore-sheet]');
    const map = document.querySelector('.leaflet-container');
    if (!sheet || !map) return -1;
    return Math.round(map.getBoundingClientRect().bottom - 8 - sheet.getBoundingClientRect().top);
  });
}

/** Nomes cortados — `ellipsis` ou conteúdo que ultrapassa a caixa. */
async function truncatedNames(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const bad: string[] = [];
    document.querySelectorAll(`${sel} [role="option"]`).forEach((row) => {
      // O nome é o primeiro filho de texto da célula do meio (.min-w-0).
      const name = row.querySelector('.min-w-0 > span');
      if (!(name instanceof HTMLElement)) return;
      const cs = getComputedStyle(name);
      if (cs.textOverflow === 'ellipsis' || name.scrollWidth > name.clientWidth + 1) {
        bad.push(name.textContent ?? '?');
      }
    });
    return bad;
  }, scope);
}

test.describe('MAP-UX-V3 §5 — sheet mobile (390×844)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test('peek mede 136 ± 4 px e mostra as duas linhas de leitura', async ({ page }) => {
    await openMapa(page);
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek', { timeout: 20_000 });

    // O peek mede-se por ResizeObserver — espera o valor assentar.
    await expect
      .poll(() => sheetVisibleHeight(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(132);
    const h = await sheetVisibleHeight(page);
    expect(h, 'peek deveria medir 136 ± 4 px').toBeLessThanOrEqual(140);

    // Linha 1 — cartão «Melhor agora»; linha 2 — «Filtros» · «Só a bombar» · contagem.
    await expect(page.locator('[data-sheet-best]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Mostrar filtros|Show filters/i })).toBeVisible();
    await expect(page.getByRole('switch', { name: /Só a bombar/i })).toBeVisible();
    await expect(sheet.getByText(/\d+ spots/).first()).toBeVisible();
    // Atribuição sempre visível — obrigação de licença.
    await expect(sheet.locator('[data-sheet-attribution]').first()).toBeVisible();
  });

  test('o arrasto segue o dedo 1:1 (erro ≤2 px a meio do gesto)', async ({ page }) => {
    await openMapa(page);
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek', { timeout: 20_000 });
    await expect.poll(() => sheetVisibleHeight(page)).toBeLessThanOrEqual(140);

    const grabber = page.locator('[data-sheet-grabber]');
    const g = await grabber.boundingBox();
    expect(g).not.toBeNull();
    const cx = g!.x + g!.width / 2;
    const cy = g!.y + g!.height / 2;
    const top0 = (await sheet.boundingBox())!.y;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 60, { steps: 3 });
    await page.waitForTimeout(60); // um frame para o dragOffset pintar

    const topMid = (await sheet.boundingBox())!.y;
    expect(
      Math.abs(topMid - (top0 - 60)),
      'o sheet segue o ponteiro 1:1 a meio do arrasto',
    ).toBeLessThanOrEqual(2);

    await page.mouse.up(); // larga — volta a assentar num estado válido
    await expect(sheet).toHaveAttribute('data-explore-sheet', /peek|half|open/);
  });

  test('flick para cima a partir do peek abre o sheet', async ({ page }) => {
    await openMapa(page);
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek', { timeout: 20_000 });
    await expect.poll(() => sheetVisibleHeight(page)).toBeLessThanOrEqual(140);

    // Eventos sintéticos — o que está sob teste é a lógica de snap com
    // projecção de momentum (220 ms), não o timing do CDP: eventos reais
    // chegam com intervalos irregulares sob carga e a velocidade medida
    // saía fraca, escolhendo «half» (flake).
    const grabber = page.locator('[data-sheet-grabber]');
    const g = await grabber.boundingBox();
    const cx = g!.x + g!.width / 2;
    const cy = g!.y + g!.height / 2;
    await grabber.dispatchEvent('pointerdown', {
      pointerId: 7, clientX: cx, clientY: cy, bubbles: true, isPrimary: true,
    });
    // Um único impulso decisivo: com eventos sintéticos em série lenta,
    // segmentos pequenos podiam medir velocidade fraca → «half» (flake).
    await grabber.dispatchEvent('pointermove', {
      pointerId: 7, clientX: cx, clientY: cy - 400, bubbles: true,
    });
    await grabber.dispatchEvent('pointerup', {
      pointerId: 7, clientX: cx, clientY: cy - 400, bubbles: true,
    });

    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open', { timeout: 5_000 });
  });

  test('nenhum nome de spot fica truncado — nem na lista nem no peek', async ({ page }) => {
    await openMapa(page);
    await expandMapHudFilters(page); // peek → half
    await page.locator('[data-sheet-grabber]').click(); // half → open
    const sheet = page.locator('[data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open');

    const rows = sheet.locator('[role="option"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    expect(
      await truncatedNames(page, '[data-explore-sheet]'),
      'nomes truncados na lista aberta',
    ).toEqual([]);

    // E o cartão «Melhor agora» do peek também não corta o nome.
    await page.locator('[data-sheet-grabber]').click(); // open → peek
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek');
    const peekTruncated = await page.evaluate(() => {
      const name = document.querySelector('[data-sheet-best] .font-display');
      if (!(name instanceof HTMLElement)) return null;
      const cs = getComputedStyle(name);
      return cs.textOverflow === 'ellipsis' || name.scrollWidth > name.clientWidth + 1;
    });
    expect(peekTruncated).toBe(false);
  });

  test('teclado: ↑/↓ navegam e Enter abre a pré-visualização', async ({ page }) => {
    await openMapa(page, '?spot=nazare');
    // M4: o deep link ?spot= abre a PRÉ-VISUALIZAÇÃO do spot (contrato
    // markers — igual à resolução do merge em map-explore-sheet.spec.ts).
    // O «← Voltar à lista» fecha-a e levanta o sheet explorar em «open».
    await expect(page.locator('[data-testid="map-spot-sheet"]')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Voltar à lista|Back to list/i }).click();
    await expect(page.locator('[data-explore-sheet]')).toHaveAttribute(
      'data-explore-sheet', 'open', { timeout: 20_000 });
    const focused = page.locator('[role="option"][data-spot-id="nazare"]');
    await expect(focused).toBeVisible();
    await focused.focus();
    await expect(focused).toBeFocused();

    const idx = Number(await focused.getAttribute('data-row-index'));
    const last = (await page.getByRole('option').count()) - 1;
    await page.keyboard.press(idx === last ? 'ArrowUp' : 'ArrowDown');
    const moved = page.locator('[data-explore-sheet] [role="option"]:focus');
    await expect(moved).toHaveAttribute(
      'data-row-index', String(idx === last ? last - 1 : idx + 1));

    // Enter na linha activa → focusSpot → sheet de detalhe do spot.
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="map-spot-sheet"]')).toBeVisible({ timeout: 15_000 });
  });

  test('meio: selects Região/Nível e switches com rótulo, chips + «Limpar»', async ({ page }) => {
    await openMapa(page);
    await expandMapHudFilters(page);
    const half = page.locator('[data-sheet-half]');
    await expect(half).toBeVisible({ timeout: 15_000 });

    // Rótulos sempre visíveis (não dependem de placeholder).
    await expect(half.getByText('Modalidade')).toBeVisible();
    await expect(half.getByLabel('Região')).toBeVisible();
    await expect(half.getByLabel('Nível')).toBeVisible();
    await expect(half.getByRole('switch', { name: 'Só a bombar' })).toBeVisible();
    await expect(half.getByRole('switch', { name: 'Agrupar spots' })).toBeVisible();

    // O select de região filtra — e o chip removível + «Limpar» aparecem.
    await half.getByLabel('Região').selectOption('Alentejo');
    await expect(half.getByRole('button', { name: 'Remover filtro Alentejo' })).toBeVisible();
    await expect(half.getByRole('button', { name: /Limpar/i })).toBeVisible();
    await half.getByRole('button', { name: /Limpar/i }).click();
    await expect(half.getByLabel('Região')).toHaveValue('Todos');
  });
});

test.describe('MAP-UX-V3 §5 — painel desktop (1440×900)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test('painel 360 px, cabeçalho «Explorar» e rail de 56 px com contagem', async ({ page }) => {
    await openMapa(page);
    const panel = page.locator('[data-map-panel="open"]');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    const box = await panel.boundingBox();
    expect(Math.round(box!.width)).toBe(360);
    await expect(panel.getByText('Explorar')).toBeVisible();
    await expect(panel.getByText(/\d+ spots nesta vista/)).toBeVisible();

    // Filtros com rótulo visível no painel.
    await expect(panel.getByText('Modalidade')).toBeVisible();
    await expect(panel.getByLabel('Região')).toBeVisible();
    await expect(panel.getByLabel('Nível')).toBeVisible();
    await expect(panel.getByRole('switch', { name: 'Só a bombar' })).toBeVisible();
    await expect(panel.getByRole('switch', { name: 'Agrupar spots' })).toBeVisible();

    // Recolhe para o rail de 56 px com a contagem vertical.
    await panel.getByRole('button', { name: /Recolher painel|Collapse panel/i }).click();
    const rail = page.locator('[data-map-panel="rail"]');
    await expect(rail).toBeVisible();
    const railBox = await rail.boundingBox();
    expect(Math.round(railBox!.width)).toBe(56);
    await expect(rail.getByText(/\d+ spots/)).toBeVisible();

    await rail.getByRole('button', { name: /Abrir lista|Open spots list/i }).click();
    await expect(panel).toBeVisible();
  });

  test('cabeçalho da lista com «Nesta vista» e chips «Saltar para»', async ({ page }) => {
    await openMapa(page);
    const panel = page.locator('[data-map-panel="open"]');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // exact — «N spots nesta vista» no cabeçalho do painel também continha
    // a substring e o locator resolvia para 2 nós.
    await expect(panel.getByText('Nesta vista', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Ordenado por score/)).toBeVisible();
    const jumps = panel.getByRole('group', { name: 'Saltar para' });
    await expect(jumps.getByRole('button', { name: 'Açores' })).toBeVisible();

    // Saltar para os Açores recentra o mapa — bounds da maquete
    // (s 36.9 / n 39.8 / w −31.4 / e −24.9 → centro ≈ 38.3, −28.2).
    // O poll espera o DESTINO (lat e lon dos Açores): lat>36.5 sozinha é
    // trivialmente verdade no continente (39.5) e lia o centro a meio do
    // flyTo de 600 ms — com CPU partilhada entre workers, a leitura podia
    // apanhar o início ou o meio do voo (lon −10 / −15 em vez de −28).
    await jumps.getByRole('button', { name: 'Açores' }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const map = (window as any).__VENTU_MAP__;
          if (!map) return null;
          const c = map.getCenter();
          return c.lat > 36.5 && c.lat < 40.5 && c.lng > -32 && c.lng < -24
            ? { lat: c.lat, lon: c.lng }
            : null;
        }), { timeout: 15_000 })
      .not.toBeNull();
  });

  test('hover bidireccional: a linha acende o marcador e vice-versa', async ({ page }) => {
    await openMapa(page); // cluster desligado via localStorage → marcadores individuais
    const row = page.locator('[data-map-panel="open"] [role="option"]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const spotId = await row.getAttribute('data-spot-id');
    expect(spotId).toBeTruthy();
    const marker = page.locator(`.leaflet-marker-icon.spot-marker[data-spot-id="${spotId}"]`);
    await expect(marker).toBeVisible();

    // Linha → marcador: anel .ventu-list-hover no divIcon.
    await row.hover();
    await expect(marker).toHaveClass(/ventu-list-hover/);
    await page.mouse.move(720, 300); // fora da linha — o anel apaga-se
    await expect(marker).not.toHaveClass(/ventu-list-hover/);

    // Marcador → linha: a linha correspondente ganha o realce. Marcadores
    // vizinhos podem sobrepor-se no hit-test (o hover() real falharia por
    // intercepção) — dispatchEvent prova a ponte pointerover→linha, que é
    // o contrato sob teste.
    await marker.dispatchEvent('pointerover', { bubbles: true });
    await expect(row).toHaveAttribute('data-marker-hover', 'true');
  });

  test('linhas de 64 px com nome sem truncagem e métricas neutras', async ({ page }) => {
    await openMapa(page);
    const rows = page.locator('[data-map-panel="open"] [role="option"]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const first = await rows.first().boundingBox();
    expect(first!.height).toBeGreaterThanOrEqual(64);

    // Cada linha expõe os factores do score no atributo estável.
    await expect(rows.first().locator('[data-score-factors]')).toHaveAttribute(
      'data-score-factors', /.+/);

    expect(
      await truncatedNames(page, '[data-map-panel="open"]'),
      'nomes truncados no painel',
    ).toEqual([]);
  });
});
