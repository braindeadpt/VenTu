import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Fase B do /mapa, PR B2 — Explorar e filtros na pele v6 (`?pele=v6`):
 * pílulas da modalidade, «Nível» com semântica de tecto, chips, lista com a
 * noite no fim e a folha a 390 px. A lógica não muda: a mesma contagem de
 * filtros, os mesmos spots e os mesmos valores com e sem a pele; só o visual
 * e os rótulos do nível («Até intermédio»). Alvos ≥ 44 px a 390 px.
 */
const SOL_RGB = 'rgb(255, 201, 60)';

async function abrir(page: Page, path: string, nivel: string | null = 'intermediate'): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript((n) => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
    if (n) localStorage.setItem('ventu:map:difficulty', n);
    else localStorage.removeItem('ventu:map:difficulty');
  }, nivel);
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

/** Mede os alvos interactivos visíveis dentro de `raiz` (só os que a pele B2 veste). */
function alvosPequenos(page: Page, seletor: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[inert]');
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          alvo: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((a) => a.w < 44 || a.h < 44);
  }, seletor);
}

test.describe('/mapa pele v6 — Explorar e filtros (B2), desktop', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('com ?pele=v6: 9 pílulas em grelha, activa em sol, Barlow Condensed', async ({ page }) => {
    await abrir(page, '/pt/mapa/?pele=v6&sport=surf');
    const painel = page.locator('[data-pele="v6"] [data-map-panel="open"]');
    await expect(painel).toBeVisible({ timeout: 20_000 });
    const pilulas = painel.locator('[data-mx="modalidades"] .pill');
    await expect(pilulas).toHaveCount(9);
    for (let i = 0; i < 9; i++) await expect(pilulas.nth(i)).toBeVisible();
    expect(await painel.locator('[data-mx="modalidades"]').evaluate((el) => getComputedStyle(el).display)).toBe('grid');
    const activa = painel.locator('[data-mx="modalidades"] .pill[aria-pressed="true"]');
    await expect(activa).toHaveCount(1);
    const estilo = await activa.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, font: cs.fontFamily, h: el.getBoundingClientRect().height };
    });
    expect(estilo.bg).toBe(SOL_RGB);
    expect(estilo.font).toContain('Barlow Condensed');
    expect(estilo.h).toBeGreaterThanOrEqual(44);
  });

  test('«Nível» com tecto: o mesmo valor e o mesmo número de chips/spots, com e sem a pele', async ({ page }) => {
    const ler = async () => {
      const painel = page.locator('[data-map-panel="open"]');
      await expect(painel).toBeVisible({ timeout: 20_000 });
      const nivel = painel.locator('[data-mx="sel"] select').nth(1);
      await expect(painel.locator('[role="option"]').first()).toBeVisible({ timeout: 20_000 });
      return {
        valor: await nivel.inputValue(),
        rotulo: await nivel.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent ?? ''),
        chips: await painel.locator('[data-mx="chip"]').count(),
        vista: (await painel.locator('[data-mx="vista-n"]').textContent())?.trim(),
      };
    };
    await abrir(page, '/pt/mapa/?pele=0&sport=surf');
    const sem = await ler();
    await abrir(page, '/pt/mapa/?pele=v6&sport=surf');
    await expect(page.locator('[data-pele="v6"]')).toBeAttached({ timeout: 15_000 });
    const com = await ler();
    expect(sem.valor).toBe('intermediate');
    expect(com.valor).toBe(sem.valor);
    expect(sem.rotulo).toBe('Intermédio');
    expect(com.rotulo).toBe('Até intermédio');
    expect(com.chips).toBe(sem.chips);
    expect(com.chips).toBe(2); // modalidade + nível
    expect(com.vista).toBe(sem.vista);
    // a contagem do cabeçalho diz o tecto e o select activo fica em sol translúcido
    await expect(page.locator('[data-mx="contagem"] [data-mx="nivel"]')).toHaveText(/até intermédio/);
    await expect(page.locator('[data-mx="sel"] select[data-activo]')).toHaveCount(1);
    await expect(page.locator('[data-mx="chip"]', { hasText: 'Até intermédio' })).toBeVisible();
  });

  test('com ?pele=v6 numa frame de noite: as linhas «noite» ficam no fim da lista', async ({ page }) => {
    await page.route('**/data/map-hours.json', async (route) => {
      const res = await route.fetch();
      const j = (await res.json()) as { spots?: Record<string, Record<string, Array<number | null>>> };
      // determinístico (o build pode ter sido gerado de noite): metade dos spots de
      // noite em todas as frames, a outra metade com 6/10 (×10 no map-hours v6)
      Object.values(j.spots ?? {}).forEach((row, i) => {
        if (Array.isArray(row.surf)) row.surf = row.surf.map(() => (i % 2 === 0 ? null : 60));
      });
      await route.fulfill({ response: res, json: j });
    });
    await abrir(page, '/pt/mapa/?pele=v6&hours=1&sport=surf', null);
    const linhas = page.locator('[data-pele="v6"] [data-map-panel="open"] [role="option"]');
    await expect(linhas.first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.locator('[data-map-panel="open"] [data-row-night]').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    const ordem = await linhas.evaluateAll((els) => els.map((el) => Boolean(el.querySelector('[data-row-night]'))));
    const primeiraNoite = ordem.indexOf(true);
    expect(primeiraNoite, 'há linhas com nota antes da noite').toBeGreaterThan(0);
    expect(ordem.slice(primeiraNoite).every(Boolean), 'depois da 1.ª noite só há noite').toBe(true);
    // mosaico numérico no fill da banda v6, «noite» em #56677B
    const nota = page.locator('[data-map-panel="open"] [role="option"] [data-mx="nota"]').first();
    const bg = await nota.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect([
      'rgb(168, 70, 74)', 'rgb(68, 121, 238)', 'rgb(201, 158, 42)', 'rgb(64, 220, 208)', 'rgb(255, 240, 122)',
    ]).toContain(bg);
    const noite = page.locator('[data-map-panel="open"] [data-row-night]').first();
    expect(await noite.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(86, 103, 123)');
  });
});

test.describe('/mapa pele v6 — folha a 390 px (B2)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('a contagem «Filtros» é a mesma com e sem a pele', async ({ page }) => {
    const contar = async () => {
      const bt = page.locator('[data-sheet-peek] [data-mx="filtros-bt"]');
      await expect(bt).toBeVisible({ timeout: 20_000 });
      return Number(((await bt.textContent()) ?? '').replace(/\D+/g, '') || 0);
    };
    await abrir(page, '/pt/mapa/?pele=0&sport=surf');
    const sem = await contar();
    await abrir(page, '/pt/mapa/?pele=v6&sport=surf');
    await expect(page.locator('[data-pele="v6"]')).toBeAttached({ timeout: 15_000 });
    const com = await contar();
    expect(sem).toBe(2);
    expect(com).toBe(sem);
    await expect(page.locator('[data-sheet-peek] [data-mx="q"]')).toHaveText('2');
  });

  test('alvos ≥ 44 px no peek, no meio (filtros) e na lista aberta', async ({ page }) => {
    await abrir(page, '/pt/mapa/?pele=v6&sport=surf');
    const sheet = page.locator('[data-pele="v6"] [data-explore-sheet]');
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek', { timeout: 20_000 });
    await expect(page.locator('[data-sheet-peek] [data-mx="filtros-bt"]')).toBeVisible({ timeout: 20_000 });
    expect(
      await alvosPequenos(page, '[data-sheet-grabber], [data-map-exit-fullscreen], [data-sheet-peek] button'),
    ).toEqual([]);

    await page.locator('[data-sheet-peek] [data-mx="filtros-bt"]').click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'half', { timeout: 10_000 });
    await expect(page.locator('[data-sheet-half] [data-mx="modalidades"] .pill')).toHaveCount(9);
    await expect(page.locator('[data-sheet-half] [data-mx="chip"]').first()).toBeVisible();
    expect(
      await alvosPequenos(
        page,
        '[data-mx="ocultar"], [data-sheet-half] [data-mx="filtros"] button, [data-sheet-half] [data-mx="filtros"] select',
      ),
    ).toEqual([]);
    await expect(page.locator('[data-sheet-count] [data-mx="nivel"]')).toHaveText(/até intermédio/);

    await page.locator('[data-sheet-grabber]').click();
    await expect(sheet).toHaveAttribute('data-explore-sheet', 'open', { timeout: 10_000 });
    await expect(page.locator('[data-sheet-open] [role="option"]').first()).toBeVisible({ timeout: 20_000 });
    expect(await alvosPequenos(page, '[data-sheet-open] [role="option"], [data-sheet-open] [data-map-jump]')).toEqual([]);
  });
});
