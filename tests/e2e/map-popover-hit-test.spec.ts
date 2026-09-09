import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { interceptIhBuoys, interceptWmoBuoys } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';

/**
 * Hit-test real das ações de dispensa/fecho dos overlays do mapa — desktop e
 * mobile. O clique do Playwright já faz este check internamente, mas falha
 * num timeout de 60s quando um overlay cobre o alvo; este spec espera por uma
 * condição real (o alvo ser o elemento de topo no seu próprio centro via
 * elementFromPoint) e falha em 5s a NOMEAR o interceptador — o mesmo padrão
 * do poll do dismiss do chip (buoy-warnings) e do scrollToSettledBottom.
 *
 * Cobertura (todas as superfícies com ação de dispensa/fecho no /mapa):
 *   1. Chip de boias → popover → «Dispensar este aviso»
 *   2. Banner de aviso de boias → «Dispensar aviso das boias»
 *   3. Popup de marcador (desktop) → fecho do popup Leaflet
 *   4. Sheet do spot (mobile) → «Fechar» e «Ver spot» (regressão histórica:
 *      a fila de ações deslizava por baixo da barra do HUD e os toques caíam
 *      no HUD — z-fix documentado no MapSpotSheet)
 *   5. Modal da legenda de vento → botão de dispensa
 *
 * Ações que navegam (Ver spot) são hit-testadas e clicadas até à navegação;
 * as restantes fecham o overlay e o spec verifica o fecho.
 */

const IH_NO_KEY = {
  fetchedAt: new Date().toISOString(),
  apiKeyConfigured: false,
  hasWaveData: false,
  stations: {},
};
const WMO_DOWN = { buoys: {}, hasWaveData: false, day: '20260815' };

/**
 * O alvo é clicável (hit-test) quando é o elemento de topo no seu próprio
 * centro. Retorna o identificador do interceptador para diagnóstico.
 */
async function expectTopmostHit(page: Page, locator: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const handle = await locator.elementHandle().catch(() => null);
      if (!handle) return 'missing';
      return handle.evaluate((node) => {
        const el = node as HTMLElement;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return 'not-rendered';
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!top) return 'no-element';
        if (top === el || el.contains(top)) return 'ok';
        const t = top as HTMLElement;
        const keys = Object.keys(t.dataset ?? {})
          .slice(0, 2)
          .join('|');
        const cls = typeof t.className === 'string' ? t.className.slice(0, 40) : '';
        return `covered-by:${t.tagName.toLowerCase()}${cls ? ` ${cls}` : ''}${keys ? ` [${keys}]` : ''}`;
      });
    })
    .toBe('ok', { timeout: 5_000 });
}

async function openMapa(
  page: Page,
  opts: { buoyNoKey?: boolean; mobile?: boolean } = {},
): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  if (opts.buoyNoKey) {
    await interceptIhBuoys(page, IH_NO_KEY);
    await interceptWmoBuoys(page, WMO_DOWN);
  }
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  if (opts.mobile) await expandMapHudFilters(page);
}

/**
 * Marcador para abrir o popup/sheet. Prefere um marcador que é o elemento de
 * topo no seu centro (clique normal); se nenhum existir (pilhas densas em
 * mobile), cai para qualquer marcador no viewport e abre-o com el.click() —
 * o listener do Leaflet vive no próprio elemento, por isso abre na mesma.
 */
async function pickInViewportMarker(page: Page): Promise<Locator> {
  const pick = await page.waitForFunction(
    () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const markers = Array.from(
        document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
      );
      for (const m of markers) {
        const r = m.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
        const top = document.elementFromPoint(cx, cy);
        if (top === m || m.contains(top)) return { index: markers.indexOf(m) };
      }
      for (const m of markers) {
        const r = m.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
        return { index: markers.indexOf(m), via: 'evaluate' };
      }
      return null;
    },
    { timeout: 30_000, polling: 250 },
  );
  const info = (await pick.jsonValue()) as { index: number; via?: 'evaluate' };
  const marker = page.locator('.leaflet-marker-icon.spot-marker').nth(info.index);
  if (info.via === 'evaluate') {
    await marker.evaluate((el) => (el as HTMLElement).click());
  } else {
    await marker.click();
  }
  return marker;
}

test.describe('Mapa — dismiss dos overlays é hit-testável (desktop + mobile)', () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe('desktop (1280×720)', () => {
    test.use({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test('chip de boias: «Dispensar este aviso» é o elemento de topo e fecha o popover', async ({
      page,
    }) => {
      await openMapa(page, { buoyNoKey: true });
      const chip = page.locator('[data-buoy-layer-chip="true"]');
      await expect(chip).toBeVisible({ timeout: 20_000 });
      await chip.click();
      const popover = page.locator('[data-buoy-chip-popover="true"]');
      await expect(popover).toBeVisible({ timeout: 10_000 });

      const dismiss = popover.getByRole('button', { name: 'Dispensar este aviso' });
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(popover).toHaveCount(0);
      await expect(chip).toHaveCount(0);
    });

    test('banner de boias: «Dispensar aviso das boias» é o elemento de topo e fecha o aviso', async ({
      page,
    }) => {
      await openMapa(page, { buoyNoKey: true });
      await expect(page.getByText('Onda observada desactivada')).toBeVisible({
        timeout: 20_000,
      });

      const dismiss = page.getByRole('button', { name: 'Dispensar aviso das boias' });
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(page.getByText('Onda observada desactivada')).toHaveCount(0);
    });

    test('popup de marcador: o fecho do popup Leaflet é o elemento de topo e fecha', async ({
      page,
    }) => {
      await openMapa(page);
      const marker = await pickInViewportMarker(page);
      await marker.click();
      const popup = page.locator('.leaflet-popup').last();
      await expect(popup).toBeVisible({ timeout: 10_000 });

      const close = popup.locator('.leaflet-popup-close-button');
      await expectTopmostHit(page, close);
      await close.click();
      await expect(popup).toHaveCount(0);
    });

    test('modal da legenda de vento: o botão de dispensa é o elemento de topo e fecha', async ({
      page,
    }) => {
      await openMapa(page);
      const help = page.getByRole('button', { name: /Como ler o vento no mapa/i });
      await expect(help).toBeVisible({ timeout: 20_000 });
      await help.click();
      const dialog = page.getByRole('dialog', { name: /Ler o arco de vento/i });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const dismiss = dialog.getByRole('button');
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(dialog).toHaveCount(0);
    });
  });

  test.describe('mobile (390×844, touch)', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test('chip de boias: «Dispensar este aviso» é o elemento de topo e fecha o popover', async ({
      page,
    }) => {
      await openMapa(page, { buoyNoKey: true, mobile: true });
      const chip = page.locator('[data-buoy-layer-chip="true"]');
      await expect(chip).toBeVisible({ timeout: 20_000 });
      await chip.click();
      const popover = page.locator('[data-buoy-chip-popover="true"]');
      await expect(popover).toBeVisible({ timeout: 10_000 });

      const dismiss = popover.getByRole('button', { name: 'Dispensar este aviso' });
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(popover).toHaveCount(0);
      await expect(chip).toHaveCount(0);
    });

    test('banner de boias: «Dispensar aviso das boias» é o elemento de topo e fecha o aviso', async ({
      page,
    }) => {
      await openMapa(page, { buoyNoKey: true, mobile: true });
      await expect(page.getByText('Onda observada desactivada')).toBeVisible({
        timeout: 20_000,
      });

      const dismiss = page.getByRole('button', { name: 'Dispensar aviso das boias' });
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(page.getByText('Onda observada desactivada')).toHaveCount(0);
    });

    test('sheet do spot: «Fechar» e «Ver spot» são o elemento de topo (regressão do HUD)', async ({
      page,
    }) => {
      await openMapa(page, { mobile: true });
      const marker = await pickInViewportMarker(page);
      await marker.click();
      const sheet = page.locator('[data-testid="map-spot-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 10_000 });

      // O CTA é um <Button href> → link, não button.
      const verSpot = sheet.getByRole('link', { name: 'Ver spot' });
      // A sheet faz scroll (max-h + overflow-y-auto) — um utilizador real rola
      // até à acção; só depois é que o CTA tem de ser o elemento de topo.
      await verSpot.scrollIntoViewIfNeeded();
      await expectTopmostHit(page, verSpot);
      await verSpot.click();
      await expect(page).toHaveURL(/\/pt\/spots\/[^/]+\//, { timeout: 15_000 });
    });

    test('sheet do spot: o «Fechar» do painel é o elemento de topo e fecha a sheet', async ({
      page,
    }) => {
      await openMapa(page, { mobile: true });
      const marker = await pickInViewportMarker(page);
      await marker.click();
      const sheet = page.locator('[data-testid="map-spot-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 10_000 });

      const close = sheet.getByRole('button', { name: 'Fechar' });
      await expectTopmostHit(page, close);
      await close.click();
      await expect(sheet).toHaveCount(0);
    });

    test('modal da legenda de vento: o botão de dispensa é o elemento de topo e fecha', async ({
      page,
    }) => {
      await openMapa(page, { mobile: true });
      const help = page.getByRole('button', { name: /Como ler o vento no mapa/i });
      await expect(help).toBeVisible({ timeout: 20_000 });
      await help.click();
      const dialog = page.getByRole('dialog', { name: /Ler o arco de vento/i });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const dismiss = dialog.getByRole('button');
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(dialog).toHaveCount(0);
    });
  });
});