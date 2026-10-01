import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * UX v3 (M4): no /mapa o popup Leaflet foi substituído pelo cartão de
 * pré-visualização `map-spot-card` (320 px, ancorado ao marcador — maquete
 * §7). O popup só resta nos embeds fora do modo Explorar.
 *
 * Escolhe um marcador clicável de forma determinística:
 *  - totalmente dentro do viewport;
 *  - com o CENTRO descoberto (elementFromPoint devolve o próprio marcador) —
 *    na vista nacional, marcadores do fundo do mapa ficam sob o cartão do HUD
 *    e um clique real acertaria no HUD (raiz do flake histórico «Element is
 *    outside of the viewport»: o marcador estava in-view mas coberto).
 * Devolve o índice no DOM, para o locator .nth().
 */
async function pickClickableMarker(page: import('@playwright/test').Page): Promise<number> {
  const pick = await page.waitForFunction(
    () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const markers = Array.from(
        document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
      );
      for (let i = 0; i < markers.length; i += 1) {
        const m = markers[i];
        const r = m.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && (top === m || m.contains(top))) return { index: i };
      }
      return null;
    },
    { timeout: 30_000, polling: 250 },
  );
  const index = (await pick.jsonValue())?.index;
  if (index === undefined || index < 0) throw new Error('sem marcador clicável');
  return index;
}

async function openCardFromMarker(page: import('@playwright/test').Page, index: number) {
  await page.evaluate((i) => {
    const marker = document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker')[i];
    marker?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, index);
  await waitForCardSettled(page);
}

/**
 * O cartão segue o marcador por rAF enquanto o mapa se move — a geometria
 * assentou quando duas amostras a 200 ms coincidem (mesma prova que a
 * versão popup desta spec fazia com o autoPan do Leaflet).
 */
async function waitForCardSettled(page: import('@playwright/test').Page): Promise<void> {
  const card = page.locator('[data-testid="map-spot-card"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () => {
        const r1 = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('[data-testid="map-spot-card"]');
          return el ? el.getBoundingClientRect().y : null;
        });
        if (r1 === null) return 'missing';
        await new Promise((r) => setTimeout(r, 200));
        const r2 = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('[data-testid="map-spot-card"]');
          return el ? el.getBoundingClientRect().y : null;
        });
        if (r2 === null) return 'missing';
        return Math.abs(r1 - r2) <= 1 ? 'stable' : `moving:${Math.abs(r1 - r2).toFixed(1)}px`;
      },
      { timeout: 15_000, intervals: [200, 200, 300] },
    )
    .toBe('stable');
}

test.describe('Map card Ver spot (v3)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
  });

  test('Ver spot link navigates to spot detail', async ({ page }) => {
    const index = await pickClickableMarker(page);
    const marker = page.locator('.leaflet-marker-icon.spot-marker').nth(index);
    // Clique real (com o centro garantidamente descoberto) abre o cartão.
    await marker.click({ force: true });
    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    const link = card.getByRole('link', { name: /Ver spot/i });
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');
    expect(href).toMatch(/\/pt\/spots\/[^/]+\//);

    await link.click();
    await expect(page).toHaveURL(/\/pt\/spots\/[^/]+\//, { timeout: 15_000 });
  });

  test('CTA do cartão fica clicável mesmo na zona do HUD', async ({ page }) => {
    // Regressão da auditoria visual 2026-09: spots no fundo do mapa (zona do
    // cartão HUD) abriam o popup POR BAIXO do HUD — o CTA ficava tapado e
    // inclicável. O cartão v3 ancora ao marcador e afasta-se do painel/HUD
    // (clamps left/top no MapSpotCard). O marcador mais a sul (max bottom
    // edge) é o pior caso, determinístico na vista nacional.
    const pick = await page.waitForFunction(
      () => {
        const markers = Array.from(
          document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
        );
        if (markers.length === 0) return null;
        let best = 0;
        let bestBottom = -Infinity;
        markers.forEach((m, i) => {
          const bottom = m.getBoundingClientRect().bottom;
          if (bottom > bestBottom) {
            bestBottom = bottom;
            best = i;
          }
        });
        return { index: best, bottom: bestBottom };
      },
      { timeout: 30_000, polling: 250 },
    );
    const index = (await pick.jsonValue())?.index;
    if (index === undefined || index < 0) throw new Error('sem marcador clicável');
    await openCardFromMarker(page, index);

    const card = page.locator('[data-testid="map-spot-card"]');
    const link = card.getByRole('link', { name: /Ver spot/i });
    await expect(link).toBeVisible({ timeout: 10_000 });

    const cta = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="map-spot-card"] a[href*="/spots/"]',
      );
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        h: Math.round(b.height),
        withinViewport:
          b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth,
        clickable: !!top && (top === el || el.contains(top)),
      };
    });
    expect(cta).not.toBeNull();
    expect(cta!.h).toBeGreaterThanOrEqual(44);
    expect(cta!.withinViewport).toBe(true);
    expect(cta!.clickable).toBe(true);
  });
});

test.describe('Map card tablet — folga da coluna de controlos', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test('cartão não sobrepõe a coluna de controlos e CTA ≥44px em touch', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

    const index = await pickClickableMarker(page);
    await openCardFromMarker(page, index);

    const card = page.locator('[data-testid="map-spot-card"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await waitForCardSettled(page); // posição assente antes de medir

    const geo = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="map-spot-card"]');
      const controls = document.querySelector<HTMLElement>('[data-map-controls]');
      const cta = card?.querySelector<HTMLElement>('a[href*="/spots/"]');
      if (!card || !cta) return null;
      const a = card.getBoundingClientRect();
      const b = controls?.getBoundingClientRect();
      const overlaps = b
        ? !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
        : false;
      return { overlaps, ctaH: Math.round(cta.getBoundingClientRect().height) };
    });
    expect(geo).not.toBeNull();
    expect(geo!.overlaps).toBe(false);
    expect(geo!.ctaH).toBeGreaterThanOrEqual(44);
  });
});
