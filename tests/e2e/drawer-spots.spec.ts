import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * #455 P0 — o `Drawer` voltou a montar. O efeito de `isOpen` tinha perdido o
 * `setMounted(true)` e o rAF do `visible`: o `SpotDrawer` do grid (/spots,
 * /modalidades, /explorar) ficava invisível e o `lockBodyScroll()` congelava
 * a página. O contrato aqui é o do report: abrir mostra a gaveta E tranca o
 * scroll; Escape fecha e devolve o scroll.
 *
 * No grid o caminho do utilizador é marcador → CTA «Ver spot» do popup
 * (`onSpotSelect` do `SpotGridClient` → `SpotDrawer`).
 */
test.describe('Drawer do grid de spots (#455)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

  test('/pt/spots/: abrir a gaveta tranca o scroll e Escape devolve-o', async ({ page }) => {
    test.setTimeout(90_000);
    await preseedWindRingLegend(page);
    // Cluster é o default no desktop — marcadores individuais só com o
    // agrupamento desligado (mesma receita do map-score-factors).
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });

    await page.goto('/pt/spots/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitHydrated(page);
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });

    await page.locator('.leaflet-marker-icon.spot-marker').first().click({ force: true });
    await page.locator('.spot-popup .ventu-popup-detail').click();

    const drawer = page.locator('[role="dialog"]:has([data-drawer-close])');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // `toBeVisible` não distingue a gaveta montada fora do ecrã: o contrato é
    // terminar em translateX(0) (o matrix identidade do Chromium).
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)', { timeout: 10_000 });

    const close = page.locator('[data-drawer-close]');
    await expect(close).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // Alvo de toque: o botão media 32×32 antes do fix (#455). Mede-se a caixa
    // real, não as classes.
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.width, 'largura do ✕').toBeGreaterThanOrEqual(44);
    expect(closeBox.height, 'altura do ✕').toBeGreaterThanOrEqual(44);

    // …e sem crescer o cabeçalho: a linha mede 57 px (32 do conteúdo + 24 do
    // py-3 + 1 da border-b). Sem a margem negativa do ✕ seriam 69 px.
    const headerBox = (await drawer.locator('[data-drawer-header]').boundingBox())!;
    expect(headerBox.height, 'altura do cabeçalho').toBeLessThan(60);

    // O `onKeyDown` do painel só vê o Escape com o foco lá dentro: o Drawer
    // move-o para o ✕ no frame de abertura. Esperar por esse contrato evita
    // uma corrida com o rAF (o teste passava ou falhava conforme o timing).
    await expect(close).toBeFocused({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    await expect(drawer).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});

/**
 * Ramo `isMobile` do `Drawer` (folha de 80vh colada ao fundo).
 *
 * A 390 px o `SpotDrawer` NÃO tem caminho no produto: o marcador abre a sheet
 * do mapa (`MapSpotSheet`) e o «Ver spot» dela é um `<Link>` para a página do
 * spot — medido: navega para /pt/spots/<slug>/ e o Drawer não monta. Por isso
 * o ramo é exercitado como numa rotação de telemóvel: a gaveta abre em
 * desktop e o viewport passa a 390×844, que é o que o `resize` do Drawer
 * observa para recalcular `isMobile` (largura < 768).
 *
 * O que este teste protege: a altura da folha (80vh), a largura/lateral, o ✕
 * de 44×44 e o cabeçalho a 57 px — o `-my-1.5` do alvo de toque é o mesmo
 * markup nos dois ramos, e aqui fica coberto o que o teste desktop não vê.
 */
test.describe('Drawer do grid de spots — ramo mobile (#455)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, serviceWorkers: 'block' });

  test('a 390 px a gaveta é a folha de 80vh e o ✕ mantém o alvo sem crescer o cabeçalho', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.cluster', '0');
    });

    await page.goto('/pt/spots/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitHydrated(page);
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
    await page.locator('.leaflet-marker-icon.spot-marker').first().click({ force: true });
    await page.locator('.spot-popup .ventu-popup-detail').click();

    const drawer = page.locator('[role="dialog"]:has([data-drawer-close])');
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Retrato de telemóvel: o Drawer reactiva `isMobile` no resize.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => Math.round((await drawer.boundingBox())?.height ?? 0), { timeout: 10_000 })
      .toBe(Math.round(844 * 0.8)); // 80vh = 675.2 px

    const box = (await drawer.boundingBox())!;
    expect(box.width, 'largura da folha').toBeCloseTo(390, 0);
    expect(Math.abs(box.y + box.height - 844), 'colada ao fundo').toBeLessThanOrEqual(1);

    const closeBox = (await page.locator('[data-drawer-close]').boundingBox())!;
    expect(closeBox.width, 'largura do ✕').toBeGreaterThanOrEqual(44);
    expect(closeBox.height, 'altura do ✕').toBeGreaterThanOrEqual(44);

    const headerBox = (await drawer.locator('[data-drawer-header]').boundingBox())!;
    expect(headerBox.height, 'altura do cabeçalho').toBeLessThan(60);
  });
});
