import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { interceptRadar } from './helpers/conditions';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Satellite IR GOES-East (NASA GIBS ABI Band 13) — ~10 min carousel.
 *
 * Hermetic: GIBS is stubbed (light tile = real imagery; the black
 * no-data tile is masked to transparent by the same mask as true-color).
 * Covers deep-link, toggle + persistence, scrub, pane order, heavy-raster
 * cap eviction with toast, and the 390 px mobile layout.
 */

/** Opaque 1x1 RGB PNG, dependency-free (hand-rolled CRC32). */
function png1x1(r: number, g: number, b: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, r, g, b]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CLOUD = png1x1(170, 180, 200);

/** Stub dos DOIS motores IR: o primário EUMETView (WMS Meteosat) e o
 *  fallback GIBS (GOES-East). Os testes do carrossel não dependem de qual
 *  motor respondeu — mas o de fallback força erros no Meteosat. */
function stubIrSources(page: Page, opts: { meteosatStatus?: number } = {}): void {
  void page.route('**/gibs.earthdata.nasa.gov/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: CLOUD,
    });
  });
  void page.route('**/view.eumetsat.int/geoserver/wms**', async (route) => {
    if (opts.meteosatStatus != null && opts.meteosatStatus >= 400) {
      // abort(): falha de rede real. Um fulfill com status 500 + body de
      // imagem é CARREGADO pelo Chromium como <img> (o corpo chega e é um
      // PNG válido — o erro HTTP é ignorado para imagens em certos caminhos
      // de fulfill) e o tileload disparava com sucesso, mascarando a falha
      // que este teste quer induzir.
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: CLOUD,
    });
  });
}

async function openMapaWithIr(page: Page, query = '?goesIr=1'): Promise<void> {
  await preseedWindRingLegend(page);
  stubIrSources(page);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

const irToggle = (page: Page) =>
  page.locator('[data-map-layers-popover="true"] [data-map-goes-ir-toggle]');

const irCarousel = (page: Page) =>
  page.locator('[data-radar-carousel="true"]', { hasText: 'Satélite IR' });

test.describe('Satelite IR GOES-East — carrossel de 10 min', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 90_000 });

  test('deep link ?goesIr=1 liga a camada: pool de tiles, badge, relogio e atribuicao', async ({
    page,
  }) => {
    await openMapaWithIr(page);

    await openMapLayersMenu(page);
    await expect(irToggle(page)).toHaveAttribute('aria-pressed', 'true');

    // Pool de TileLayers por frame (um layer por frame, opacidade por ativa)
    // — agora Meteosat primário (ventu-meteosat-ir) com GOES de fallback.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              document.querySelectorAll('.leaflet-layer.ventu-meteosat-ir, .leaflet-layer.ventu-goes-ir')
                .length,
          ),
        { timeout: 20_000, message: 'pool de layers IR criado' },
      )
      .toBeGreaterThan(0);

    // Panes: IR (206) acima do true-color (205).
    const panes = await page.evaluate(() => ({
      gibs: (document.querySelector('.leaflet-ventu-gibs-sat-pane') as HTMLElement | null)?.style
        .zIndex,
      ir: (document.querySelector('.leaflet-ventu-goes-ir-pane') as HTMLElement | null)?.style
        .zIndex,
    }));
    expect(panes.ir).toBe('206');

    const badge = irCarousel(page);
    await expect(badge).toBeVisible({ timeout: 20_000 });
    // Relogio do frame (HH:MM Lisboa) + contador 1/12.
    await expect(badge).toHaveText(/Satélite IR/);
    await expect(badge).toHaveText(/\d{2}:\d{2}/);
    await expect(badge).toHaveText(/1\/12/);
    // Atribuição do motor primário (EUMETSAT, não IPMA nem NASA).
    await expect(badge.getByRole('link', { name: /Meteosat-11/ })).toBeVisible();
    await expect(badge.getByRole('link', { name: /Meteosat-11/ })).toHaveAttribute(
      'href',
      'https://user.eumetsat.int/data-access/eumetview',
    );
    // Motor primário no DOM: layers WMSTileLayer com className Meteosat.
    await expect
      .poll(
        async () =>
          page.evaluate(() => document.querySelectorAll('.leaflet-layer.ventu-meteosat-ir').length),
        { timeout: 20_000, message: 'pool de layers Meteosat criado' },
      )
      .toBeGreaterThan(0);
  });

  test('Meteosat em erro → fallback para GOES-East (camada continua viva)', async ({
    page,
  }) => {
    await preseedWindRingLegend(page);
    stubIrSources(page, { meteosatStatus: 500 });
    await page.goto('/pt/mapa/?goesIr=1', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await waitHydrated(page);

    // Com o Meteosat a 500, o pool troca para layers GOES (className vai
    // aparecer) e o badge/camassel continua — a camada nunca fica morta.
    await expect
      .poll(
        async () =>
          page.evaluate(() => document.querySelectorAll('.leaflet-layer.ventu-goes-ir').length),
        { timeout: 30_000, message: 'fallback GOES-East activo após falha Meteosat' },
      )
      .toBeGreaterThan(0);
    await expect(irCarousel(page)).toBeVisible({ timeout: 20_000 });
  });

  test('toggle desliga/liga e persiste em localStorage', async ({ page }) => {
    await openMapaWithIr(page);
    await openMapLayersMenu(page);
    const toggle = irToggle(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(irCarousel(page)).toHaveCount(0);
    const storedOff = await page.evaluate(() => localStorage.getItem('ventu.goes-ir.state'));
    expect(storedOff ?? '').toContain('"enabled":false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(irCarousel(page)).toBeVisible({ timeout: 20_000 });
    const storedOn = await page.evaluate(() => localStorage.getItem('ventu.goes-ir.state'));
    expect(storedOn ?? '').toContain('"enabled":true');
  });

  test('scrub muda o frame e o contador acompanha', async ({ page }) => {
    await openMapaWithIr(page);
    const badge = irCarousel(page);
    await expect(badge).toBeVisible({ timeout: 20_000 });

    const scrubber = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(scrubber).toBeVisible();
    await scrubber.fill('5');
    await expect(badge).toHaveText(/6\/12/);
  });

  test('cap de raster: 3a pesada desliga a mais antiga com toast', async ({ page }) => {
    // Cenário 100 % por UI (sem LS pré-semeado): os toggles manuais passam
    // pelo toggleHeavy, que mantém a ordem de activação de forma síncrona —
    // sem a corrida do restauro LS/reconciliação no arranque, que tornava o
    // despejo não-determinístico (a 3a camada às vezes entrava antes da
    // reconciliação e o toast nunca disparava).
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      (window as unknown as { __rasterOff: unknown[] }).__rasterOff = [];
      window.addEventListener('ventu:map-raster-off', (e) =>
        (window as unknown as { __rasterOff: unknown[] }).__rasterOff.push(
          (e as CustomEvent).detail,
        ),
      );
    });
    await page.route('**/gibs.earthdata.nasa.gov/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: CLOUD,
      });
    });
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await waitHydrated(page);

    await openMapLayersMenu(page);
    const popover = page.locator('[data-map-layers-popover="true"]');
    const gibsToggle = popover.locator('[data-map-gibs-sat-toggle]');
    const goesToggle = popover.locator('[data-map-goes-ir-toggle]');
    const bathyToggle = popover.locator('[data-map-bathymetry-toggle]');
    await gibsToggle.click();
    await expect(gibsToggle).toHaveAttribute('aria-pressed', 'true');
    await goesToggle.click();
    await expect(goesToggle).toHaveAttribute('aria-pressed', 'true');
    // O toast vive na MapLayersZoneView (chunk dinâmico): só clicar na 3a
    // camada quando o carrossel do IR está visível prova que o listener do
    // `ventu:map-raster-off` já montou — sem isto o despejo acontecia sem
    // toast quando o chunk ainda carregava.
    await expect(
      page.locator('[data-radar-carousel="true"]', { hasText: 'Satélite IR' }),
    ).toBeVisible({ timeout: 20_000 });
    // O listener do toast é um `useEffect` passivo do mesmo chunk: o badge
    // pode pintar no mesmo frame do commit, antes do efeito correr. Uma
    // folga curta garante que o `ventu:map-raster-off` tem quem o oiça.
    await page.waitForTimeout(500);

    // 3a raster pesada (batimetria) — desliga a mais antiga (gibsSat) e avisa.
    // O evento é a asserção primária (não expira); o toast vive ~3,2 s e
    // afirma-se logo a seguir ao clique.
    await bathyToggle.click();
    // Polling por temporizador (100 ms), não por RAF: o `toBeVisible` faz
    // poll por RAF, que pode ficar cego quando o mapa pesado estrangula frames e o
    // toast (3,2 s) expira entre polls — falsos negativos sob carga.
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="status"]')).some((el) =>
          /Satélite NASA.*para manter o mapa fluido/.test(el.textContent ?? ''),
        ),
      { timeout: 10_000, polling: 100 },
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __rasterOff: unknown[] }).__rasterOff,
          ),
        { timeout: 10_000 },
      )
      .toEqual([{ key: 'gibsSat' }]);
    await expect(gibsToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(goesToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(bathyToggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('mobile 390 px: badge visivel sem overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMapaWithIr(page);
    const badge = irCarousel(page);
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'sem scroll horizontal a 390 px').toBeLessThanOrEqual(0);
  });

  test('mobile 390 px: toggle do sheet liga o IR (sem menu desktop)', async ({ page }) => {
    // No fullscreen mobile o menu Camadas não renderiza — as camadas vivem
    // na grelha «Camadas» do sheet (estado half).
    await page.setViewportSize({ width: 390, height: 844 });
    await preseedWindRingLegend(page);
    stubIrSources(page);
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await waitHydrated(page);

    await page.locator('[data-sheet-grabber]').click(); // peek → half
    const toggle = page
      .locator('[data-explore-sheet]')
      .getByRole('group', { name: 'Camadas' })
      .first()
      .locator('[data-map-goes-ir-toggle]');
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(irCarousel(page)).toBeVisible({ timeout: 20_000 });
  });

  test('radar + IR em simultaneo: dois carrosseis, IR 84 px acima', async ({ page }) => {
    // O cap permite as duas; o badge do IR sobe ~84 px para não tapar o do
    // radar (fullscreen: HUD detém o radar, IR flutuante por cima).
    const frames = Array.from({ length: 12 }, (_, i) => {
      const minutes = 60 - i * 5;
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      return {
        frameTime: `2026-08-15T${hh}:${mm}:00.000Z`,
        framePath: `pcr-2026-08-15T${hh}${mm}.png`,
        imagePath: `radar/frames/pcr-2026-08-15T${hh}${mm}.png`,
      };
    });
    await preseedWindRingLegend(page);
    await interceptRadar(page, {
      source: 'ipma-radar',
      fetchedAt: '2026-08-15T01:05:00.000Z',
      frameTime: frames[0].frameTime,
      framePath: frames[0].framePath,
      imagePath: 'radar/ipma-radar.png',
      frames,
      bounds: { south: 34.011513, west: -12.454795, north: 43.792862, east: -4.345465 },
      attribution: 'IPMA',
    });
    stubIrSources(page);
    await page.goto('/pt/mapa/?goesIr=1&radar=1', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await waitHydrated(page);

    // «Dados IPMA» vs badge do IR: distinguem-se pela atribuição
    // (Meteosat-11 no motor primário; radar mantém «Dados IPMA»).
    const radarBadge = page.locator('[data-radar-carousel="true"]', {
      hasText: 'Dados IPMA',
    });
    const irBadge = irCarousel(page);
    await expect(radarBadge).toBeVisible({ timeout: 20_000 });
    await expect(irBadge).toBeVisible({ timeout: 20_000 });

    const bottoms = await page.evaluate(() => {
      const px = (el: Element | null) =>
        el ? parseFloat(getComputedStyle(el as HTMLElement).bottom || '0') : NaN;
      const carousels = Array.from(document.querySelectorAll('[data-radar-carousel="true"]'));
      const byText = (t: string) => carousels.find((c) => c.textContent?.includes(t)) ?? null;
      return { ir: px(byText('Meteosat-11')), radar: px(byText('Dados IPMA')) };
    });
    expect(bottoms.radar, 'radar ancorado acima do HUD').toBeGreaterThanOrEqual(32);
    expect(
      bottoms.ir - bottoms.radar,
      'IR 84 px acima do radar para não o tapar',
    ).toBe(84);
  });
});
