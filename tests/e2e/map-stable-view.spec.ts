import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { showAllMapMarkers } from './helpers/map-sheet';

/**
 * Vista estável do mapa — auditoria do mapa.
 *
 * Bug A (provado): um refresh de dados (visibilitychange / 15 min / defer
 * de 5 s) re-executava o efeito de marcadores, que começava por
 * closePopupAndSheet() + clearLayers() — popup e sheet morriam sozinhos.
 * Agora o efeito faz diff in-place via cache de marcadores; popup/sheet só
 * fecham quando o spot aberto deixa de estar visível ou o filtro muda.
 *
 * Bug B (provado): o fitBounds era o onDone do runChunked — qualquer mudança
 * de dependência cancelava a inserção e o mapa ficava ~5 s no zoom default,
 * pedindo tiles que eram depois abortados. Agora o mapa nasce enquadrado
 * (bounds das coords antes do basemap) e o re-enquadre é imediato, uma vez
 * por chave de filtro (sem o nº de spots) e nunca depois de o utilizador
 * navegar.
 */

interface MapView {
  zoom: number;
  center: [number, number];
}

async function openMapa(page: Page, prefs?: { cluster?: string; onlyOn?: string }) {
  await preseedWindRingLegend(page);
  await page.addInitScript((p) => {
    localStorage.setItem('ventu.mapdebug', '1');
    if (p?.cluster) localStorage.setItem('ventu.map.cluster', p.cluster);
    if (p?.onlyOn) localStorage.setItem('ventu.map.onlyOn', p.onlyOn);
  }, prefs ?? null);
  await page.goto('/pt/mapa/?sport=all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

async function mapView(page: Page): Promise<MapView> {
  return page.evaluate(() => {
    const map = (window as unknown as { __VENTU_MAP__?: { getZoom(): number; getCenter(): { lat: number; lng: number } } }).__VENTU_MAP__;
    if (!map) throw new Error('__VENTU_MAP__ ausente — ventu.mapdebug não pegou');
    return { zoom: map.getZoom(), center: [map.getCenter().lat, map.getCenter().lng] };
  });
}

/** Dispara um refresh real de conditions.json e espera o pedido sair. */
async function triggerRefresh(page: Page) {
  const req = page.waitForRequest('**/data/conditions.json', { timeout: 20_000 });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await req;
}

test.describe('Map stable view', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('popup sobrevive a um refresh de dados (desktop, cluster desligado)', async ({ page }) => {
    // Scores novos no refresh → os marcadores são recriados — o popup tem de
    // reabrir na nova instância, não desaparecer. O JSON é pré-buscado uma
    // vez: route.fetch() dentro do handler morre («Response disposed») se a
    // página fechar a meio (refresh diferido de 5 s corre até ao fim do teste).
    const baseJson = (await (await page.request.get('/data/conditions.json')).json()) as Record<
      string,
      { waveHeight?: number; swellHeight?: number }
    >;
    let mutate = false;
    await page.route('**/data/conditions.json', async (route) => {
      if (!mutate) return route.continue();
      const json = structuredClone(baseJson);
      for (const e of Object.values(json)) {
        if (e && typeof e === 'object') {
          e.waveHeight = (e.waveHeight ?? 1) * 1.6;
          e.swellHeight = (e.swellHeight ?? 1) * 1.6;
        }
      }
      return route.fulfill({ json });
    });
    await openMapa(page, { cluster: '0' });

    const marker = page.locator('.spot-marker').first();
    await expect(marker).toBeAttached({ timeout: 20_000 });
    await marker.dispatchEvent('click');
    const popup = page.locator('.leaflet-popup');
    await expect(popup).toBeVisible({ timeout: 10_000 });

    mutate = true;
    await triggerRefresh(page);
    await expect(popup).toBeVisible({ timeout: 15_000 });
  });

  test('vista escolhida pelo utilizador sobrevive a refresh que muda o nº de spots', async ({
    page,
  }) => {
    // «Só a bombar» ligado: a 2ª resposta de conditions.json deixa só um
    // subconjunto com score — o count de spots visíveis muda. Antes, o
    // boundsKey incluía o length e re-enquadrava por cima da vista do
    // utilizador; agora a chave é só o filtro e a vista não mexe.
    let mutate = false;
    const baseJson = (await (await page.request.get('/data/conditions.json')).json()) as Record<
      string,
      { waveHeight?: number; swellHeight?: number; wavePeriod?: number; swellPeriod?: number }
    >;
    const keys = Object.keys(baseJson);
    await page.route('**/data/conditions.json', async (route) => {
      if (!mutate) return route.continue();
      const json = structuredClone(baseJson);
      keys.forEach((key, i) => {
        const e = json[key];
        if (!e || typeof e !== 'object') return;
        if (i < 10) {
          e.waveHeight = (e.waveHeight ?? 1) * 2;
          e.swellHeight = (e.swellHeight ?? 1) * 2;
        } else {
          e.waveHeight = 0;
          e.swellHeight = 0;
          e.wavePeriod = 0;
          e.swellPeriod = 0;
        }
      });
      return route.fulfill({ json });
    });
    await openMapa(page, { cluster: '0', onlyOn: '1' });
    await expect(page.locator('.spot-marker').first()).toBeAttached({ timeout: 20_000 });

    // O utilizador arrasta o mapa para a sua vista — dragstart marca
    // navegação própria e nenhum refresh a pode sobrescrever.
    const box = await page.locator('.leaflet-container').boundingBox();
    const cx = (box?.x ?? 0) + (box?.width ?? 800) / 2;
    const cy = (box?.y ?? 0) + (box?.height ?? 600) / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 160, cy - 100, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const before = await mapView(page);

    mutate = true;
    await triggerRefresh(page);
    // Deixa o diff assentar (marcadores recriados/removidos, sem re-enquadre).
    await page.waitForTimeout(2000);
    const after = await mapView(page);

    expect(after.zoom).toBe(before.zoom);
    expect(Math.abs(after.center[0] - before.center[0])).toBeLessThan(0.05);
    expect(Math.abs(after.center[1] - before.center[1])).toBeLessThan(0.05);
  });

  test('arranque sem tiles abortados e vista final num só zoom', async ({ page }) => {
    const abortedTiles: string[] = [];
    page.on('requestfailed', (req) => {
      // Só imagens: os aborts de «document» são prefetches de <Link> do Next
      // que morrem ao fim da navegação — não têm nada a ver com o arranque do mapa.
      if (req.resourceType() === 'image' && req.failure()?.errorText.includes('ERR_ABORTED')) {
        abortedTiles.push(req.url());
      }
    });
    await openMapa(page);

    // A primeira observação do mapa já é a vista final — o fit correu antes
    // de anexar o basemap, logo não há pedidos ao zoom default para abortar.
    await page.waitForFunction(
      () => (window as unknown as { __VENTU_MAP__?: unknown }).__VENTU_MAP__ != null,
      undefined,
      { timeout: 20_000 },
    );
    const first = await mapView(page);
    await page.waitForSelector('.leaflet-marker-icon', { timeout: 20_000 });
    // Espera o refresh diferido (5 s) — a vista não pode saltar com ele.
    await page.waitForTimeout(6000);
    const late = await mapView(page);

    expect(late.zoom).toBe(first.zoom);
    expect(Math.abs(late.center[0] - first.center[0])).toBeLessThan(0.01);
    expect(Math.abs(late.center[1] - first.center[1])).toBeLessThan(0.01);
    expect(abortedTiles).toEqual([]);
  });

});

// Segunda descrição com viewport mobile para o teste do sheet.
test.describe('Map stable view — mobile 390×844', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  test.describe.configure({ timeout: 60_000 });

  test('sheet sobrevive a um refresh de dados (visibilitychange)', async ({ page }) => {
    await openMapa(page, { cluster: '0' });

    // Mobile FORÇA o cluster no arranque (ignora o localStorage) → sem o
    // desfazer pela UI não existe nenhum `.spot-marker` e o toBeAttached
    // expirava (CI #499). Mesmo caminho documentado: peek → «Mostrar todos».
    await waitHydrated(page);
    await showAllMapMarkers(page);

    const marker = page.locator('.spot-marker').first();
    await expect(marker).toBeAttached({ timeout: 20_000 });
    await marker.dispatchEvent('click');
    const sheet = page.locator('[data-testid="map-spot-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await triggerRefresh(page);
    await expect(sheet).toBeVisible({ timeout: 15_000 });
  });
});
