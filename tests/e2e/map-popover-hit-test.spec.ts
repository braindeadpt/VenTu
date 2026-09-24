import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { interceptIhBuoys, interceptWmoBuoys } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';
import { expectTopmostHit } from './helpers/hit-test';
import { showAllMapMarkers } from './helpers/map-sheet';

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
 *   2. Sem banner de boias sobre o mapa (C4: toast→chip — o aviso vive só
 *      no popover do chip)
 *   3. Cartão de pré-visualização do marcador (desktop, UX v3) → «Fechar»
 *      do cartão (o popup Leaflet já não existe no /mapa — resta nos embeds)
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
  await page.goto('/pt/mapa/?sport=all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
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
  if (opts.mobile) {
    // O mobile FORÇA o cluster no arranque (ignora o localStorage). Sem
    // desfazer o cluster pela UI não existem `.spot-marker` individuais para
    // clicar — o pick ficava à espera até ao timeout de 60 s do teste (foi
    // assim que o CI #496 e o #499 falharam, com a árvore a mostrar só
    // «Melhor score N · X spots nesta zona»). showAllMapMarkers faz o
    // caminho documentado: peek → «Mostrar todos» → volta ao peek, e só
    // devolve com os marcadores montados e o mapa parado.
    await showAllMapMarkers(page);
    await expandMapHudFilters(page);
  }
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
  // O fitBounds/markercluster animam os ícones: medir a meio dá rects fora do
  // viewport e o predicado nunca assenta. O CI #496 morreu aqui (timeout de
  // 60 s dentro deste waitForFunction) — espera o pane do Leaflet parar antes
  // de escolher (duas amostras iguais do transform).
  await page
    .waitForFunction(
      () => {
        const pane = document.querySelector<HTMLElement>('.leaflet-map-pane');
        const t = pane?.style.transform ?? '';
        const w = window as unknown as { __ventuPane?: string; __ventuPaneStable?: number };
        if (w.__ventuPane === t) w.__ventuPaneStable = (w.__ventuPaneStable ?? 0) + 1;
        else {
          w.__ventuPane = t;
          w.__ventuPaneStable = 0;
        }
        return (w.__ventuPaneStable ?? 0) >= 3;
      },
      { timeout: 10_000, polling: 150 },
    )
    .catch(() => {
      /* mapa já parado (ou sem pane): seguir para a escolha */
    });

  const pick = await page
    .waitForFunction(
      () => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const markers = Array.from(
          document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
        );
        // Critério: o CENTRO do ícone dentro do viewport. Exigir o rect
        // INTEIRO dentro não tinha candidatos em mobile (os ícones encostam
        // às margens depois do enquadramento) e o waitForFunction só saía no
        // timeout do teste — a causa do flake do CI #496.
        const centred = markers
          .map((m, index) => ({ m, index, r: m.getBoundingClientRect() }))
          .filter(({ r }) => {
            if (r.width <= 0 || r.height <= 0) return false;
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            return cx >= 0 && cx <= vw && cy >= 0 && cy <= vh;
          });
        // O popup abre para CIMA do marcador — preferir os mais baixos no ecrã
        // mantém o popup (e o botão de fecho) fora da faixa de overlays do
        // topo (barra de controlos, aviso de boias). Sem candidatos com folga,
        // aceita qualquer marcador centrado: o teste mede o hit-test do
        // overlay, não a posição ideal do popup.
        const POPUP_ROOM = 170;
        const withRoom = centred
          .filter(({ r }) => r.top + r.height / 2 >= POPUP_ROOM)
          .sort((a, b) => b.r.top - a.r.top);
        const pool =
          withRoom.length > 0 ? withRoom : [...centred].sort((a, b) => b.r.top - a.r.top);
        for (const { m, index, r } of pool) {
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          if (top === m || m.contains(top)) return { index };
        }
        if (pool.length > 0) return { index: pool[0].index, via: 'evaluate' };
        return null;
      },
      { timeout: 20_000, polling: 250 },
    )
    .catch(() => null);

  const info = (await pick?.jsonValue().catch(() => null)) as
    | { index: number; via?: 'evaluate' }
    | null;
  if (!info) {
    // Diagnóstico em vez de um timeout mudo: quantos marcadores existem e onde.
    // Se a página já fechou (o timeout do TESTE disparou antes), não vale a
    // pena mascarar o erro real com «Target page, context or browser closed».
    const diag = page.isClosed()
      ? null
      : await page
          .evaluate(() => {
            const markers = Array.from(
              document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
            );
            return {
              total: markers.length,
              vw: window.innerWidth,
              vh: window.innerHeight,
              sample: markers.slice(0, 5).map((m) => {
                const r = m.getBoundingClientRect();
                return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
              }),
            };
          })
          .catch(() => null);
    throw new Error(
      'openInViewportMarker: nenhum spot-marker com o centro no viewport' +
        (diag
          ? ` (total=${diag.total}, viewport=${diag.vw}x${diag.vh}, amostra=[${diag.sample.join(' | ')}])`
          : ' (página já fechada)'),
    );
  }
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
        if (r.width <= 0 || r.height <= 0) continue;
        // Mesmo critério do pick: o CENTRO dentro do viewport chega (o rect
        // inteiro deixava a lista vazia em mobile — flake do CI #496).
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
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

    test('sem banner de boias sobre o mapa — o aviso vive só no chip do HUD (C4)', async ({
      page,
    }) => {
      await openMapa(page, { buoyNoKey: true });
      const chip = page.locator('[data-buoy-layer-chip="true"]');
      await expect(chip).toBeVisible({ timeout: 20_000 });
      // O banner saiu do mapa: o título só existe dentro do popover do chip.
      await expect(page.getByText('Onda observada desactivada')).toHaveCount(0);
      await chip.click();
      await expect(
        page.locator('[data-buoy-chip-popover="true"]').getByText('Onda observada desactivada'),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('cartão do marcador (v3): o «Fechar» é o elemento de topo e fecha a pré-visualização', async ({
      page,
    }) => {
      await openMapa(page);
      await openInViewportMarker(page);
      const card = page.locator('[data-testid="map-spot-card"]');
      await expect(card).toBeVisible({ timeout: 10_000 });

      const close = card.getByRole('button', { name: 'Fechar' });
      await expectTopmostHit(page, close);
      await close.click();
      await expect(card).toHaveCount(0);
    });

    test('modal da legenda de vento: o botão de dispensa é o elemento de topo e fecha', async ({
      page,
    }) => {
      await openMapa(page);
      const help = page.getByRole('button', { name: /Como ler o vento no mapa/i });
      await expect(help).toBeVisible({ timeout: 20_000 });
      await help.click();
      const dialog = page.getByRole('dialog', { name: /Ler o vento no mapa/i });
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

    test('sem banner de boias sobre o mapa — o aviso vive só no chip do HUD (C4)', async ({
      page,
    }) => {
      await openMapa(page, { buoyNoKey: true, mobile: true });
      const chip = page.locator('[data-buoy-layer-chip="true"]');
      await expect(chip).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Onda observada desactivada')).toHaveCount(0);
      await chip.click();
      await expect(
        page.locator('[data-buoy-chip-popover="true"]').getByText('Onda observada desactivada'),
      ).toBeVisible({ timeout: 10_000 });
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
      const dialog = page.getByRole('dialog', { name: /Ler o vento no mapa/i });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const dismiss = dialog.getByRole('button');
      await expectTopmostHit(page, dismiss);
      await dismiss.click();
      await expect(dialog).toHaveCount(0);
    });
  });
});