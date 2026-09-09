import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
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
  const { index } = await pick.jsonValue();
  if (index === undefined || index < 0) throw new Error('sem marcador clicável');
  return index;
}

async function openPopupFromMarker(page: import('@playwright/test').Page, index: number) {
  await page.evaluate((i) => {
    const marker = document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker')[i];
    marker?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, index);
  await page.waitForTimeout(1200); // deixa o autoPan do popup assentar
}

test.describe('Map popup Ver spot', () => {
  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
  });

  test('Ver spot link navigates to spot detail', async ({ page }) => {
    const index = await pickClickableMarker(page);
    const marker = page.locator('.leaflet-marker-icon.spot-marker').nth(index);
    // Clique real (com o centro garantidamente descoberto) abre o popup.
    await marker.click({ force: true });
    const link = page.locator('.ventu-popup-detail').first();
    await expect(link).toBeVisible({ timeout: 10_000 });

    const href = await link.getAttribute('href');
    expect(href).toMatch(/\/pt\/spots\/[^/]+\//);

    await link.click();
    await expect(page).toHaveURL(/\/pt\/spots\/[^/]+\//, { timeout: 15_000 });
  });

  test('CTA do popup fica clicável mesmo na zona do HUD (autoPan)', async ({ page }) => {
    // Regressão da auditoria visual 2026-09: spots no fundo do mapa (zona do
    // cartão HUD) abriam o popup POR BAIXO do HUD — o CTA ficava tapado e
    // inclicável. O fix (autoPanPaddingBottomRight) faz o mapa panear até o
    // popup assentar acima do HUD. O marcador mais a sul (max bottom edge)
    // é o pior caso, determinístico na vista nacional.
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
    const { index } = await pick.jsonValue();
    await openPopupFromMarker(page, index);

    const link = page.locator('.ventu-popup-detail').first();
    await expect(link).toBeVisible({ timeout: 10_000 });

    const cta = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.ventu-popup-detail');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        h: Math.round(b.height),
        withinViewport:
          b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth,
        clickable: !!top && (top === el || el.contains(top) || top.closest('.ventu-popup-detail') === el),
      };
    });
    expect(cta).not.toBeNull();
    expect(cta!.h).toBeGreaterThanOrEqual(44);
    expect(cta!.withinViewport).toBe(true);
    expect(cta!.clickable).toBe(true);
  });
});

test.describe('Map popup tablet — folga da coluna de controlos', () => {
  test.use({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  test('popup não sobrepõe a coluna de controlos e CTA ≥44px em touch', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

    const index = await pickClickableMarker(page);
    await openPopupFromMarker(page, index);

    const link = page.locator('.ventu-popup-detail').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1200); // pan assente antes de medir

    const geo = await page.evaluate(() => {
      const popup = document.querySelector<HTMLElement>('.spot-popup .leaflet-popup-content');
      const controls = document.querySelector<HTMLElement>('[data-map-controls]');
      const cta = document.querySelector<HTMLElement>('.ventu-popup-detail');
      if (!popup || !controls || !cta) return null;
      const a = popup.getBoundingClientRect();
      const b = controls.getBoundingClientRect();
      const overlaps =
        !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      return { overlaps, ctaH: Math.round(cta.getBoundingClientRect().height) };
    });
    expect(geo).not.toBeNull();
    expect(geo!.overlaps).toBe(false);
    expect(geo!.ctaH).toBeGreaterThanOrEqual(44);
  });
});