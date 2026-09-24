/**
 * Alvos de toque do mapa — WCAG 2.5.8 (≥44×44 CSS px) + rótulo i18n do botão
 * fullscreen.
 *
 * Audit visual (2026-09) encontrou alvos <44px no mapa: toggle da legenda
 * (105×17 em mobile) e ✕ do aviso de boias (22×22). Todos corrigidos; este
 * spec impede regressões nas garantias NÃO-HUD do mapa:
 *
 *  1. Mobile (/pt/mapa/) — toggle da legenda ≥44px e expande ao toque.
 *  2. Tablet (768×1024, touch) — o mesmo piso para o toggle da legenda.
 *  3. Desktop (/pt/spots/) — rótulo do botão fullscreen vem do i18n
 *     ("Explorar mapa" / "Explore map"), nunca texto hard-coded.
 *  4. Mobile hero da homepage — chips radar/isóbatas ≥44×44.
 *
 * (Os alvos do HUD «Modo explorar» — rádios, pills, densidade V3′ — vivem em
 * tests/e2e/map-hud.spec.ts.)
 */
import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

async function expectMinTargetSize(
  locator: ReturnType<import('@playwright/test').Page['locator']>,
  label: string,
) {
  const box = await locator.boundingBox();
  expect(box, `${label} deveria ter caixa mensurável`).not.toBeNull();
  expect(box!.width, `${label} largura`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} altura`).toBeGreaterThanOrEqual(44);
}

async function openMapa(
  page: import('@playwright/test').Page,
  path = '/pt/mapa/',
) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

test.describe('Mapa — alvos de toque ≥44px', () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe('mobile /pt/mapa/', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('legenda do sheet: <summary> ≥44px e expande ao toque', async ({ page }) => {
      await openMapa(page);

      // A legenda mobile vive no <details> do estado «half» do sheet —
      // o <summary> é o único controlo (WCAG 2.5.8).
      await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
      const summary = page.locator('[data-explore-sheet] details summary');
      await expectMinTargetSize(summary, 'summary «Legenda» do sheet');

      await summary.click();
      await expect(page.getByRole('region', { name: 'Legenda do mapa' })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Legenda do mapa' }).locator('.h-2'),
      ).toBeVisible();
    });
  });

  test.describe('tablet 768px (touch — layout sm+)', () => {
    test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('toggle da legenda ≥44px na pilha de controlos (UX v3 §2/§4)', async ({ page }) => {
      await openMapa(page);

      // M2: o toggle deixou de viver dentro do cartão da legenda — é um
      // botão da pilha direita com aria-pressed, e o cartão abre por
      // omissão no layout desktop (≥768px).
      const toggle = page.locator('[data-map-legend-toggle]');
      await expect(toggle).toBeVisible();
      await expectMinTargetSize(toggle, 'toggle «Legenda» da pilha');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('region', { name: 'Legenda do mapa' })).toBeVisible();

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('region', { name: 'Legenda do mapa' })).toHaveCount(0);
    });
  });

  test.describe('desktop /pt/spots/ — rótulo i18n do fullscreen', () => {
    test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('PT mostra "Explorar mapa", EN mostra "Explore map"', async ({ page }) => {
      await openMapa(page, '/pt/spots/');
      await expect(page.getByRole('button', { name: 'Explorar mapa', exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await page.goto('/en/spots/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
      await waitHydrated(page);
      await expect(page.getByRole('button', { name: 'Explore map', exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe('mobile homepage — chips do hero', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('botões radar e isóbatas ≥44×44', async ({ page }) => {
      await preseedWindRingLegend(page);
      await page.goto('/pt/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitHydrated(page);

      const hero = page.getByRole('region', { name: /Mapa interactivo/i });
      await expect(hero).toBeVisible({ timeout: 20_000 });

      const radar = hero.getByRole('button', { name: /Radar/i }).first();
      await expectMinTargetSize(radar, 'chip radar do hero');
      const isobaths = hero.getByRole('button', { name: /isóbatas/i }).first();
      await expectMinTargetSize(isobaths, 'chip isóbatas do hero');
    });
  });
});
