import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { spots } from '../../src/lib/spots';
import { getMacroRegion } from '../../src/lib/regions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { waitMapSettled } from './helpers/map-sheet';

/**
 * UX v3 (M4) — marcadores por colisão no /mapa (§6 e §7 do MAP-UX-V3,
 * maquete aprovada `recluster()`):
 *
 *   1. Arranque: 100 % dos spots do continente têm marcador (completo OU
 *      ponto) — nenhum desaparece nem fica dentro de um cluster opaco.
 *   2. Marcadores completos NUNCA se sobrepõem — bounding boxes de `.v3mk`
 *      sem intersecção a 3 níveis de zoom e 3 larguras.
 *   3. O badge «+N» faz zoomToBounds animado para os membros do grupo.
 *   4. O representante do grupo é o de MAIOR score (decisão por score).
 *   5. Clique num marcador/ponto abre a pré-visualização: cartão de 320 px
 *      no desktop, sheet no mobile. Deep link ?spot= abre-a directamente.
 *   6. Entrada de marcadores em opacity (150 ms), desligada com
 *      prefers-reduced-motion.
 *   7. «←» do sheet volta à lista; clique no oceano/Esc desselecciona.
 */

const ISLANDS = new Set(['Açores', 'Madeira']);
/** Spots do continente — o enquadramento inicial do /mapa cobre-os a todos. */
const CONTINENT_IDS = spots
  .filter((s) => !ISLANDS.has(getMacroRegion(s.region)))
  .map((s) => s.id);

async function openMapa(
  page: Page,
  query = '?sport=all',
  opts: { debugHandle?: boolean } = {},
): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript((debug) => {
    if (debug) localStorage.setItem('ventu.mapdebug', '1');
    // A superfície nova só existe no modo Explorar — sem a hora/deep links.
    localStorage.removeItem('ventu.map.cluster');
  }, opts.debugHandle === true);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  // Os marcadores entram por chunks em rAF — esperar a contagem estabilizar.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-v3spot]').length > 0,
    { timeout: 30_000, polling: 250 },
  );
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await waitMapSettled(page);
  // Inserção chunked (8/batch + yield em mobile): «>0» + settled não chega —
  // o probe pode apanhar a fila a meio. Espera a contagem estabilizar.
  await expect
    .poll(
      async () => {
        const n = await page.locator('[data-v3spot]').count();
        await page.waitForTimeout(300);
        const m = await page.locator('[data-v3spot]').count();
        return n === m ? n : -1;
      },
      { timeout: 30_000, intervals: [350] },
    )
    .toBeGreaterThan(0);
}

interface MarkerDomInfo {
  id: string;
  kind: string;
  score: number;
  members: string[];
  rect: { x: number; y: number; w: number; h: number };
  inViewport: boolean;
}

function probeMarkers(page: Page): Promise<MarkerDomInfo[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return Array.from(
      document.querySelectorAll<HTMLElement>('[data-v3spot]'),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      const more = el.querySelector<HTMLElement>('.v3more');
      return {
        id: el.dataset.v3spot ?? '',
        kind: el.dataset.v3kind ?? '',
        score: Number(el.dataset.spotScore),
        members: (more?.dataset.v3members ?? '').split(',').filter(Boolean),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        inViewport:
          r.width > 0 &&
          r.x + r.width / 2 >= 0 &&
          r.x + r.width / 2 <= vw &&
          r.y + r.height / 2 >= 0 &&
          r.y + r.height / 2 <= vh,
      };
    });
  });
}

/** Zero sobreposições entre completos — bounding boxes de `.v3mk`. */
async function expectNoFullOverlap(page: Page, zoomLabel: string): Promise<number> {
  const fulls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>('.v3mk')).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.v3spot ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
    });
  });
  const overlaps: string[] = [];
  for (let i = 0; i < fulls.length; i += 1) {
    for (let j = i + 1; j < fulls.length; j += 1) {
      const a = fulls[i];
      const b = fulls[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // Tolerância de 0.5 px para o arredondamento dos transforms do Leaflet.
      if (ox > 0.5 && oy > 0.5) overlaps.push(`${a.id} × ${b.id} (${ox.toFixed(1)}×${oy.toFixed(1)})`);
    }
  }
  expect(overlaps, `sobreposições a ${zoomLabel}: ${overlaps.join('; ')}`).toHaveLength(0);
  return fulls.length;
}

async function setMapZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((z) => {
    const map = (window as unknown as { __VENTU_MAP__?: { setZoom: (v: number) => void } })
      .__VENTU_MAP__;
    map?.setZoom(z);
  }, zoom);
  await waitMapSettled(page);
}

test.describe('Marcadores v3 — LOD por colisão (arranque, continente)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ serviceWorkers: 'block' });

  test('desktop 1440×900: todos os spots do continente têm marcador; ≥12 completos; zero overlaps', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page, '?sport=all', { debugHandle: true });

    const markers = await probeMarkers(page);
    const ids = new Set(markers.map((m) => m.id));
    // 100 % dos spots do continente: completos + pontos, nenhum escondido.
    const missing = CONTINENT_IDS.filter((id) => !ids.has(id));
    expect(missing, `spots do continente sem marcador: ${missing.join(', ')}`).toHaveLength(0);
    expect(markers.every((m) => m.kind === 'full' || m.kind === 'dot')).toBe(true);
    // Cada spot aparece exactamente uma vez.
    expect(markers.length).toBe(ids.size);

    const fulls = markers.filter((m) => m.kind === 'full');
    expect(fulls.length, 'marcadores completos no arranque (desktop)').toBeGreaterThanOrEqual(12);

    await expectNoFullOverlap(page, 'zoom de arranque');
    for (const z of [9.5, 12]) {
      await setMapZoom(page, z);
      await expectNoFullOverlap(page, `zoom ${z}`);
    }
  });

  test('mobile 390×844: ≥8 completos e zero overlaps nos 3 zooms', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      // Touch real: o mapa não força layout mobile sem isto.
    });
    await openMapa(page, '?sport=all', { debugHandle: true });

    const markers = await probeMarkers(page);
    const ids = new Set(markers.map((m) => m.id));
    const missing = CONTINENT_IDS.filter((id) => !ids.has(id));
    expect(missing, `spots do continente sem marcador: ${missing.join(', ')}`).toHaveLength(0);

    const fulls = markers.filter((m) => m.kind === 'full');
    expect(fulls.length, 'marcadores completos no arranque (mobile)').toBeGreaterThanOrEqual(8);

    await expectNoFullOverlap(page, 'zoom de arranque (mobile)');
    for (const z of [9.5, 12]) {
      await setMapZoom(page, z);
      await expectNoFullOverlap(page, `zoom ${z} (mobile)`);
    }
  });

  test('tablet 768×1024: zero overlaps e todos os spots com marcador', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openMapa(page, '?sport=all', { debugHandle: true });
    const markers = await probeMarkers(page);
    const ids = new Set(markers.map((m) => m.id));
    expect(CONTINENT_IDS.filter((id) => !ids.has(id))).toHaveLength(0);
    await expectNoFullOverlap(page, 'arranque 768');
  });
});

test.describe('Marcadores v3 — badge «+N» e decisão por score', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('o representante do grupo tem o MAIOR score e o badge conta os pontos', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page, '?sport=all');

    const markers = await probeMarkers(page);
    const byId = new Map(markers.map((m) => [m.id, m]));
    const groups = markers.filter((m) => m.kind === 'full' && m.members.length > 1);
    expect(groups.length, 'grupos «+N» no arranque').toBeGreaterThan(0);

    for (const g of groups) {
      const badge = g.members.length - 1;
      const scores = g.members.map((id) => byId.get(id)?.score ?? -1);
      expect(Math.max(...scores), `grupo de ${g.id}`).toBe(g.score);
      // «+N» no DOM do marcador
      const badgeText = await page
        .locator(`[data-v3spot="${g.id}"] .v3more`)
        .textContent();
      expect(badgeText).toBe(`+${badge}`);
    }
  });

  test('clique no «+N» faz zoomToBounds para os membros (zoom aumenta)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page, '?sport=all', { debugHandle: true });

    const badge = page.locator('.v3more').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const zoomBefore = await page.evaluate(
      () => (window as unknown as { __VENTU_MAP__?: { getZoom: () => number } }).__VENTU_MAP__?.getZoom() ?? -1,
    );
    await badge.click({ force: true });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __VENTU_MAP__?: { getZoom: () => number } }).__VENTU_MAP__?.getZoom() ??
              -1,
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(zoomBefore);
  });

  test('a entrada dos marcadores é só opacity (150 ms) — desligada com reduced-motion', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'mede o estilo inline do ícone Leaflet');
    await page.setViewportSize({ width: 1440, height: 900 });
    // reduced-motion activo via test.use → os ícones não podem ter a entrada.
    await openMapa(page, '?sport=all');
    const hasMotionlessEntry = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'))
        .slice(0, 20)
        .every((el) => el.style.opacity !== '0' && !el.style.transition.includes('opacity')),
    );
    expect(hasMotionlessEntry).toBe(true);
  });

  test('sem reduced-motion a entrada fica ligada (opacity 150 ms no ícone)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'mede o estilo inline do ícone Leaflet');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openMapa(page, '?sport=all');
    // A entrada aplica `transition: opacity .15s` inline no ícone do Leaflet
    // (fica no elemento depois da animação — prova determinística da wiring).
    const ok = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker')).some(
        (el) => el.style.transition.includes('opacity'),
      ),
    );
    expect(ok).toBe(true);
  });
});

test.describe('Marcadores v3 — pré-visualização do spot (§7)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('desktop: clique abre o cartão de 320 px ancorado ao marcador', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page, '?sport=all');

    // Marcador completo clicável no viewport (elemento de topo no centro).
    const spotId = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll<HTMLElement>('[data-v3kind="full"]')) {
        const icon = el.closest<HTMLElement>('.leaflet-marker-icon');
        if (!icon) continue;
        const r = icon.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        if (cx < 0 || cx > vw || cy < 0 || cy > vh) continue;
        const top = document.elementFromPoint(cx, cy);
        if (top === icon || icon.contains(top)) return el.dataset.v3spot ?? null;
      }
      return null;
    });
    expect(spotId, 'marcador completo clicável no viewport').toBeTruthy();
    await page.locator(`[data-v3spot="${spotId}"]`).first().click({ force: true });

    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    expect(await card.getAttribute('data-spot-id')).toBe(spotId);
    const box = await card.boundingBox();
    expect(box?.width).toBe(320);
    // O cartão fica dentro do mapa (não nasce por cima do painel nem fora).
    const overflow = await card.evaluate(
      (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 400,
    );
    expect(overflow).toBe(false);
    // «Ver spot» navega para a página do spot.
    const cta = card.getByRole('link', { name: /Ver spot/ });
    await expect(cta).toBeVisible();
    // Esc fecha a pré-visualização.
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
  });

  test('desktop: ?spot= abre a pré-visualização directamente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page, '?sport=all&spot=nazare');
    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    expect(await card.getAttribute('data-spot-id')).toBe('nazare');
    // Sparkline das 48 h presente quando o ficheiro a cobre.
    await expect(card.locator('svg[viewBox="0 0 288 44"]')).toBeVisible({ timeout: 15_000 });
  });

  test('mobile: clique abre o sheet com «←» que volta à lista', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMapa(page, '?sport=all');

    const spotId = await page.evaluate(() => {
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll<HTMLElement>('[data-v3spot]')) {
        const icon = el.closest<HTMLElement>('.leaflet-marker-icon');
        if (!icon) continue;
        const r = icon.getBoundingClientRect();
        const cy = r.y + r.height / 2;
        // Acima do peek do sheet (~3/4 do ecrã) para o toque não lhe cair.
        if (cy < 80 || cy > vh * 0.6) continue;
        // O centro tem de ser o próprio marcador — um ponto de outro grupo
        // tapado por um marcador completo recebe o toque no badge «+N»
        // (zoom) ou noutro spot, não no esperado.
        const top = document.elementFromPoint(r.x + r.width / 2, cy);
        if (top && icon.contains(top) && !top.closest('.v3more')) {
          return el.dataset.v3spot ?? null;
        }
      }
      return null;
    });
    expect(spotId, 'marcador clicável acima do peek').toBeTruthy();
    await page.locator(`[data-v3spot="${spotId}"]`).first().click({ force: true });

    const sheet = page.locator('[data-testid="map-spot-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    const back = sheet.getByRole('button', { name: /Voltar à lista/ });
    await expect(back).toBeVisible();
    await back.click();
    // «←» fecha a pré-visualização E levanta o sheet de exploração.
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-explore-sheet]')).toHaveAttribute('data-explore-sheet', 'open', {
      timeout: 10_000,
    });
  });

  test('mobile: ?spot= abre o sheet do spot', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMapa(page, '?sport=all&spot=nazare');
    const sheet = page.locator('[data-testid="map-spot-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet).toContainText('Nazaré');
  });
});
