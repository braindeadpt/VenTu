import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { interceptIhBuoys, interceptWmoBuoys } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';
import { expectTopmostHit } from './helpers/hit-test';

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
/** Camada saudável → status null → nem banner nem chip. Sem isto, dados de
 *  boias stale (local) abrem o aviso no topo do mapa e cobrem o botão de
 *  fecho de popups abertos por marcadores altos. */
const IH_FRESH = {
  fetchedAt: new Date().toISOString(),
  apiKeyConfigured: true,
  hasWaveData: true,
  stations: { stub: { status: 'active', latest: { date: new Date().toISOString() } } },
};

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
  } else {
    await interceptIhBuoys(page, IH_FRESH);
  }
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  // Todos os fetches de dados (warnings, boias, condições…) resolvidos antes
  // de tocar em marcadores: cada resposta tardia re-corre o efeito dos
  // marcadores e reconstrói-os — um clique a meio disso apanha o elemento
  // detached e o Playwright fica a tentar até ao timeout.
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  // O refresh diferido do /mapa (deferRefreshMs=5s) re-corre o efeito dos
  // marcadores e chama closePopupAndSheet — sem esta espera fecha um
  // popup/sheet aberto a meio do teste («not-rendered»/detach). O atributo é
  // o sinal e2e do useLiveGridSpotData para exactamente esta corrida.
  await page.waitForSelector('html[data-grid-live-deferred="done"]', { timeout: 30_000 });
  if (opts.mobile) await expandMapHudFilters(page);
}

/**
 * Abre o popup/sheet de um marcador no viewport e devolve-o JÁ aberto —
 * quem chama NÃO deve clicar outra vez (o segundo clique cai no backdrop da
 * sheet em mobile e fica preso até ao timeout). Prefere um marcador que é o
 * elemento de topo no seu centro (clique normal); se nenhum existir (pilhas
 * densas em mobile), cai para qualquer marcador no viewport e abre-o com
 * el.click() — o listener do Leaflet vive no próprio elemento, por isso abre
 * na mesma.
 */
async function openInViewportMarker(page: Page): Promise<Locator> {
  const pick = await page.waitForFunction(
    () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const markers = Array.from(
        document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
      );
      // O popup abre para CIMA do marcador — ordenar do mais baixo para o mais
      // alto no ecrã mantém o popup (e o botão de fecho) fora da faixa de
      // overlays do topo (barra de controlos, aviso de boias).
      const inView = markers
        .map((m, index) => ({ m, index, r: m.getBoundingClientRect() }))
        .filter(
          ({ r }) =>
            r.width > 0 &&
            r.height > 0 &&
            r.left >= 0 &&
            r.top >= 0 &&
            r.right <= vw &&
            r.bottom <= vh,
        )
        .sort((a, b) => b.r.top - a.r.top);
      for (const { m, index, r } of inView) {
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top === m || m.contains(top)) return { index };
      }
      if (inView.length > 0) return { index: inView[0].index, via: 'evaluate' };
      return null;
    },
    { timeout: 30_000, polling: 250 },
  );
  const info = (await pick.jsonValue()) as { index: number; via?: 'evaluate' };
  const marker = page.locator('.leaflet-marker-icon.spot-marker').nth(info.index);
  // Em mobile o mapa corre clustered: o markercluster adiciona/remove ícones
  // durante as animações — o elemento resolvido por índice pode ser
  // destacado (ou o índice deixar de existir) a meio do clique. O listener
  // do Leaflet vive no próprio elemento, por isso re-consultar o DOM fresco
  // e fazer el.click() abre na mesma (o alvo do hit-test é o overlay, não o
  // marcador).
  const clickFresh = () =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const m of document.querySelectorAll<HTMLElement>(
        '.leaflet-marker-icon.spot-marker',
      )) {
        const r = m.getBoundingClientRect();
        if (
          r.width > 0 &&
          r.height > 0 &&
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= vw &&
          r.bottom <= vh
        ) {
          m.click();
          return;
        }
      }
      throw new Error('openInViewportMarker: nenhum spot-marker no viewport');
    });
  if (info.via === 'evaluate') {
    await clickFresh();
  } else {
    try {
      await marker.click({ timeout: 8_000 });
    } catch {
      await clickFresh();
    }
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
      await openInViewportMarker(page);
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
      await openInViewportMarker(page);
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
      await openInViewportMarker(page);
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