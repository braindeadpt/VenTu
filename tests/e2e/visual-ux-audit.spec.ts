/**
 * Auditoria UX visual — botão a botão, desktop + mobile.
 * Simula percursos de utilizador real com verificação de erros JS/consola.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { attachPageHealthCollectors, assertHealthyPage } from './helpers/audit-utils';
import { expandMapHudFilters } from './helpers/map-hud';
import { openMapSpotSheet } from './helpers/map-sheet';

type Viewport = 'desktop' | 'mobile';

const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function createContext(browser: import('@playwright/test').Browser, viewport: Viewport) {
  return browser.newContext({
    viewport: VIEWPORTS[viewport],
    hasTouch: viewport === 'mobile',
  });
}

async function setupPage(context: BrowserContext, viewport: Viewport) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('ventu:windRingLegendSeen', '1'); } catch {}
  });
  const health = attachPageHealthCollectors(page);
  return { page, health };
}

async function gotoHealthy(page: Page, health: ReturnType<typeof attachPageHealthCollectors>, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
}

async function openMobileMenu(page: Page) {
  const trigger = page.locator('button[aria-controls="mobile-nav"]');
  await trigger.scrollIntoViewIfNeeded();
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 });
  await expect(page.locator('#mobile-nav')).toHaveAttribute('aria-hidden', 'false');
}

async function closeMobileMenu(page: Page) {
  const trigger = page.locator('button[aria-controls="mobile-nav"]');
  if ((await trigger.getAttribute('aria-expanded')) === 'true') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'false', { timeout: 10_000 });
  await expect(page.locator('#mobile-nav')).toHaveAttribute('aria-hidden', 'true');
}

async function openSearch(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

for (const viewport of ['desktop', 'mobile'] as Viewport[]) {
  test.describe(`UX audit — ${viewport}`, () => {
    test.describe.configure({ mode: 'parallel' });

    test('01 — Homepage: filtro desporto no hero sincroniza URL', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      const hero = page.getByRole('region', { name: /Mapa interactivo/i });
      await hero.getByRole('button', { name: 'Kitesurf', exact: true }).click();
      await expect(page).toHaveURL(/sport=kitesurf/);
      await expect(hero.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(hero.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 10_000 },
      );
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });

      await context.close();
    });

    test('01b — /mapa: filtros desporto e região sincronizam URL', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/mapa/');
      await page.waitForSelector('[data-map-hud="visible"]', { timeout: 25_000 });
      await expandMapHudFilters(page);

      await page.getByRole('button', { name: 'Kitesurf', exact: true }).click();
      await expect(page).toHaveURL(/sport=kitesurf/);
      await page.getByRole('button', { name: 'Algarve', exact: true }).click();
      await expect(page).toHaveURL(/region=Algarve/);

      await page.reload();
      await page.waitForSelector('[data-map-hud="visible"]', { timeout: 25_000 });
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await expandMapHudFilters(page);
      await expect(page.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('button', { name: 'Algarve', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await context.close();
    });

    test('02 — Homepage: mapa Leaflet carrega', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');
      await page.waitForSelector('.leaflet-container', { timeout: 20_000 });
      await expect(page.locator('.leaflet-container')).toBeVisible();
      await context.close();
    });

    test('02c — /mapa: toggle mostrar todos os spots', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/mapa/');
      await page.waitForSelector('.leaflet-container', { timeout: 25_000 });

      const mapShell = page.locator('[data-map-fullscreen="true"]');
      await expect(mapShell).toBeVisible({ timeout: 20_000 });

      const clustered = await mapShell.getAttribute('data-map-cluster');
      if (clustered === 'true') {
        await page.getByRole('button', { name: /Mostrar todos|Show all/i }).click();
        await expect(mapShell).toHaveAttribute('data-map-cluster', 'false');
      } else {
        await expect(mapShell).toHaveAttribute('data-map-cluster', 'false');
      }

      await expect(page.locator('.leaflet-marker-icon.spot-marker').first()).toBeVisible({
        timeout: 15_000,
      });

      const clusterBtn = page.getByRole('button', { name: /Agrupar spots|Cluster spots/i });
      if (await clusterBtn.isVisible()) {
        await clusterBtn.click();
        await expect(mapShell).toHaveAttribute('data-map-cluster', 'true');
      }

      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('02d — /mapa: sheet com Como chegar e Ver spot', async ({ browser }) => {
      test.skip(viewport === 'desktop', 'Mobile sheet only');
      test.setTimeout(60_000);
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/mapa/');
      await page.waitForSelector('[data-map-hud="visible"]', { timeout: 35_000 });

      const sheet = await openMapSpotSheet(page);
      await expect(
        sheet.getByRole('link', { name: /Como chegar|Get directions/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(sheet.getByRole('link', { name: /Ver spot|View spot/i })).toBeVisible({
        timeout: 15_000,
      });

      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('02b — /mapa: já abre em fullscreen', async ({ browser }) => {
      test.setTimeout(60_000);
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/mapa/');
      await page.waitForSelector('.leaflet-container', { timeout: 35_000 });
      await page.waitForSelector('[data-map-hud="visible"]', { timeout: 35_000 });

      const mapShell = page.locator('[data-map-fullscreen="true"]');
      await expect(mapShell).toBeVisible({ timeout: 30_000 });
      await expect(mapShell).toHaveAttribute('data-map-hud', 'visible');

      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('03 — Header: pesquisa abre, navega e fecha com Escape', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      await openSearch(page);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox').fill('Guincho');
      await dialog.getByRole('link', { name: /Guincho/i }).first().click();
      await expect(page).toHaveURL(/\/pt\/spots\/guincho\/?/);
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });

      await page.goBack();
      await openSearch(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await context.close();
    });

    test('04 — Header: alternar tema claro/escuro', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      // Theme toggle lives in the desktop action row; on mobile it's inside the drawer.
      if (viewport === 'mobile') {
        await openMobileMenu(page);
      }
      const themeBtn =
        viewport === 'mobile'
          ? page.locator('#mobile-nav').getByRole('button', {
              name: /Alternar para tema|Switch to .* theme/i,
            })
          : page.getByRole('banner').getByRole('button', {
              name: /Alternar para tema|Switch to .* theme/i,
            });
      await expect(themeBtn).toBeVisible();

      const wasOcean = await page.evaluate(() => document.documentElement.classList.contains('theme-ocean'));
      await themeBtn.click();
      const isOceanAfter = await page.evaluate(() => document.documentElement.classList.contains('theme-ocean'));
      expect(isOceanAfter).toBe(!wasOcean);

      await themeBtn.click();
      const isOceanRestored = await page.evaluate(() => document.documentElement.classList.contains('theme-ocean'));
      expect(isOceanRestored).toBe(wasOcean);
      await context.close();
    });

    test('05 — Header: mudar idioma PT → EN', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      // Desktop + mobile both mount a locale <select>; target the visible one.
      if (viewport === 'mobile') {
        await openMobileMenu(page);
        await page.locator('#mobile-nav select').selectOption('en');
      } else {
        await page.locator('header select').locator('visible=true').selectOption('en');
      }
      await expect(page).toHaveURL(/\/en\/?$/);
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('06 — Navegação principal: todas as páginas carregam', async ({ browser }) => {
      test.setTimeout(90_000);
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);

      // Pages reachable from the new header IA (Condições / Planear / Directório /
      // Notícias / conta) plus Sobre via footer sitemap.
      const routes: { path: string; url: RegExp }[] = [
        { path: '/pt/mapa/', url: /\/pt\/mapa\/?/ },
        { path: '/pt/spots/', url: /\/pt\/spots\/?/ },
        { path: '/pt/explorar/', url: /\/pt\/explorar\/?/ },
        { path: '/pt/livecams/', url: /\/pt\/livecams\/?/ },
        { path: '/pt/sazonalidade/', url: /\/pt\/sazonalidade\/?/ },
        { path: '/pt/compare/', url: /\/pt\/compare\/?/ },
        { path: '/pt/ferramentas/', url: /\/pt\/ferramentas\/?/ },
        { path: '/pt/diretorio/', url: /\/pt\/diretorio\/?/ },
        { path: '/pt/news/', url: /\/pt\/news\/?/ },
        { path: '/pt/favorites/', url: /\/pt\/favorites\/?/ },
        { path: '/pt/passaporte/', url: /\/pt\/passaporte\/?/ },
        { path: '/pt/about/', url: /\/pt\/about\/?/ },
      ];

      for (const route of routes) {
        await gotoHealthy(page, health, route.path);
        await expect(page).toHaveURL(route.url, { timeout: 15_000 });
        await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      }
      await context.close();
    });

    test('07 — Desktop: mega menu Condições → Surf + Planear → Sazonalidade', async ({ browser }) => {
      test.skip(viewport === 'mobile', 'Mega menu só existe em desktop');
      test.setTimeout(60_000);      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      const banner = page.getByRole('banner');
      const conditionsBtn = banner.getByRole('button', { name: /Condições/i });
      await conditionsBtn.click();
      await expect(conditionsBtn).toHaveAttribute('aria-expanded', 'true');
      const conditionsPanel = page.locator('#mega-menu-conditions');
      await expect(conditionsPanel).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/pt\/modalidades\/surf\/?/, { timeout: 15_000 }),
        conditionsPanel.locator('a[href="/pt/modalidades/surf/"]').click(),
      ]);
      await expect(page.getByRole('heading', { level: 1, name: /Surf/i })).toBeVisible();
      await expect(banner.getByRole('button', { name: /Condições/i })).toHaveAttribute('aria-current', 'true');

      await gotoHealthy(page, health, '/pt/');
      const planBtn = banner.getByRole('button', { name: /Planear/i });
      await planBtn.click();
      await expect(planBtn).toHaveAttribute('aria-expanded', 'true');
      const planPanel = page.locator('#mega-menu-plan');
      await expect(planPanel).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/pt\/sazonalidade\/?/, { timeout: 15_000 }),
        planPanel.locator('a[href="/pt/sazonalidade/"]').click(),
      ]);
      await expect(banner.getByRole('button', { name: /Planear/i })).toHaveAttribute('aria-current', 'true');
      await context.close();
    });

    test('08 — Mobile: menu hamburger agrupado abre e fecha', async ({ browser }) => {
      test.skip(viewport === 'desktop', 'Hamburger só em mobile');
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      await openMobileMenu(page);
      const mobileNav = page.locator('#mobile-nav');
      await expect(mobileNav.getByRole('button', { name: /Condições/i })).toBeVisible();
      await expect(mobileNav.getByRole('link', { name: /Explorar/i })).toBeVisible();
      await expect(mobileNav.getByRole('link', { name: /Directório|Diretório/i })).toBeVisible();
      await mobileNav.getByRole('button', { name: /Planear/i }).click();
      await expect(mobileNav.getByRole('link', { name: /Sazonalidade/i })).toBeVisible();

      await closeMobileMenu(page);
      await context.close();
    });

    test('09 — Compare: seleccionar 2 spots e comparar', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/compare/');
      await expect(page.getByText('Spot vs Spot')).toBeVisible();

      await page.getByPlaceholder('Procurar spot...').fill('Guincho');
      await page.getByRole('button', { name: /Guincho/i }).click();
      await page.getByPlaceholder('Procurar spot...').fill('Nazar');
      await page.getByRole('button', { name: /Nazar/i }).click();
      await page.getByRole('button', { name: 'Comparar' }).click();

      await expect(page).toHaveURL(/spots=.*guincho.*nazare|spots=.*nazare.*guincho/i, { timeout: 15_000 });
      await expect(page.locator('main')).toContainText(/Guincho/i, { timeout: 20_000 });
      await expect(page.locator('main')).toContainText(/Nazar/i, { timeout: 20_000 });
      await context.close();
    });

    test('10 — Favoritos: login obrigatório para guardar', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);

      await gotoHealthy(page, health, '/pt/spots/guincho/');
      await page.getByRole('button', { name: /Entrar para guardar Guincho|Sign in to save Guincho/i }).click();
      await expect(page.getByRole('dialog', { name: /Entrar|Sign in/i })).toBeVisible({ timeout: 10_000 });

      await gotoHealthy(page, health, '/pt/favorites/');
      const favHeading = page.getByRole('heading', { name: /Meus Favoritos|My Favorites/i });
      const unavailable = page.getByText(/Favoritos indisponíveis|Favorites unavailable/i);
      await expect(favHeading.or(unavailable)).toBeVisible({ timeout: 15_000 });
      if (await unavailable.isVisible().catch(() => false)) {
        // Supabase não configurado — feature indisponível é esperado
      } else {
        await expect(page.getByRole('button', { name: /Entrar com magic link|Sign in with magic link/i })).toBeVisible();
      }
      await context.close();
    });

    test('11 — Notícias: filtros categoria, data e limpar', async ({ browser }) => {
      test.setTimeout(60_000);
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/news/');

      const categoryGroup = page.getByRole('group', { name: /Filtrar por categoria|Filter by category/i });
      const surfBtn = categoryGroup.getByRole('button', { name: /^S\s*Surf$/i });
      await surfBtn.click();
      await expect(surfBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
      await expect
        .poll(() => new URL(page.url()).searchParams.get('category'))
        .toBe('surf');

      const sevenDays = page.getByRole('button', { name: /7 dias|7 days/i });
      await sevenDays.click();
      await expect(sevenDays).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
      await expect
        .poll(() => new URL(page.url()).searchParams.get('period'))
        .toBe('7d');

      await page.getByRole('button', { name: /Limpar filtros|Clear filters/i }).click();
      await expect(surfBtn).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
      await expect
        .poll(() => new URL(page.url()).searchParams.get('category'))
        .toBeNull();
      await context.close();
    });

    test('12 — Explorar: landing SEO navega correctamente', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/explorar/');

      const firstLanding = page
        .locator('main a[href^="/pt/explorar/"]:not([href="/pt/explorar/"]):not([href="/pt/explorar"])')
        .first();
      const href = await firstLanding.getAttribute('href');
      expect(href).toMatch(/\/pt\/explorar\/[^/]+\/?$/);
      await firstLanding.click();
      await expect(page).toHaveURL(/\/pt\/explorar\/[^/]+\/?/, { timeout: 15_000 });
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('13 — Spot detail: conteúdo e voltar', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/spots/nazare/');

      await expect(page.locator('main')).toContainText(/Nazar/i, { timeout: 20_000 });
      await page.getByRole('link', { name: /Voltar|Back/i }).first().click();
      await expect(page).toHaveURL(/\/pt\/spots\/?/);
      await context.close();
    });

    test('16 — Spot detail: secções estruturadas sem duplicados', async ({ browser }) => {
      test.setTimeout(90_000);
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/spots/guincho/');

      const hero = page.locator('header[data-spot-slug]');
      await expect(hero.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
        timeout: 30_000,
      });

      // Hero score card includes compact metric chips (not duplicated in Agora)
      await expect(hero.locator('.grid.grid-cols-2')).toHaveCount(1);

      await expect(hero.getByRole('meter')).toBeVisible({ timeout: 15_000 });
      await expect(hero.getByRole('status', { name: /Confiança da previsão/i })).toBeVisible({
        timeout: 15_000,
      });
      // Hero lives inside <main> — assert badge only in hero, not duplicated in Agora
      const agora = page.locator('section').filter({
        has: page.getByRole('heading', { name: /^Agora$|^Now$/i }),
      });
      await expect(agora.getByRole('status', { name: /Confiança da previsão/i })).toHaveCount(0);

      await expect(page.getByRole('heading', { name: /^Agora$|^Now$/i })).toBeVisible({
        timeout: 25_000,
      });
      await expect(
        page.getByRole('heading', { name: /Previsão horária|Hourly forecast/i }),
      ).toBeVisible({ timeout: 25_000 });
      await expect(page.getByRole('heading', { name: /Localização|Location/i })).toBeVisible({
        timeout: 15_000,
      });

      const bestWindows = page.getByRole('heading', { name: /Melhores janelas|Best windows/i });
      if ((await bestWindows.count()) > 0) {
        await expect(bestWindows).toHaveCount(1);
      }

      const livecamHeading = page.getByRole('heading', { name: /Câmara ao vivo|Live camera/i });
      if ((await livecamHeading.count()) > 0) {
        await expect(livecamHeading).toHaveCount(1);
      }

      await expect(page.getByRole('heading', { name: /Logística|Logistics/i })).toBeVisible({
        timeout: 15_000,
      });

      // Single primary directions CTA in hero; location uses text link when present
      await expect(
        hero.getByRole('link', { name: /Como chegar|Get directions/i }),
      ).toHaveCount(1);

      // Sport tabs switch updates active state
      const kiteTab = page.getByRole('button', { name: /Kitesurf/i });
      if (await kiteTab.isVisible()) {
        await kiteTab.click();
        await expect(kiteTab).toHaveAttribute('aria-pressed', 'true');
      }

      // Guincho: curated Surftotal — external live link only (map may use OSM iframe)
      await expect(page.getByRole('link', { name: /Ver ao vivo|Watch live/i })).toBeVisible();
      await expect(page.locator('iframe[src*="windy"], iframe[src*="webcam"], iframe[src*="beachcam"]')).toHaveCount(0);

      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('14 — Logo: volta à homepage', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/about/');
      const logo = page.getByRole('banner').getByRole('link', { name: 'VenTu', exact: true });
      await expect(logo).toHaveAttribute('href', /\/pt\/?/);
      await logo.evaluate((el) => (el as HTMLAnchorElement).click());
      await expect(page).toHaveURL(/\/pt\/?$/);
      await context.close();
    });

    test('15 — Sem erros JS não filtrados', async ({ browser }) => {
      const context = await createContext(browser, viewport);
      const { page, health } = await setupPage(context, viewport);

      const pages = ['/pt/', '/pt/spots/guincho/', '/pt/compare/', '/pt/news/', '/pt/explorar/', '/pt/livecams/'];
      for (const path of pages) {
        await gotoHealthy(page, health, path);
      }
      expect(health.pageErrors, `Erros JS:\n${health.pageErrors.join('\n')}`).toHaveLength(0);
      await context.close();
    });
  });
}
