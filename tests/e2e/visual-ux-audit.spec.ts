/**
 * Auditoria UX visual — botão a botão, desktop + mobile.
 * Simula percursos de utilizador real com verificação de erros JS/consola.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { attachPageHealthCollectors, assertHealthyPage } from './helpers/audit-utils';

type Viewport = 'desktop' | 'mobile';

const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function setupPage(context: BrowserContext, viewport: Viewport) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORTS[viewport]);
  const health = attachPageHealthCollectors(page);
  return { page, health };
}

async function gotoHealthy(page: Page, health: ReturnType<typeof attachPageHealthCollectors>, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
}

async function openMobileMenu(page: Page) {
  const trigger = page.getByRole('button', { name: /Abrir menu|Open menu/i });
  await trigger.click();
  await expect(page.locator('#mobile-nav')).toHaveAttribute('aria-hidden', 'false');
}

async function openSearch(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

for (const viewport of ['desktop', 'mobile'] as Viewport[]) {
  test.describe(`UX audit — ${viewport}`, () => {
    test.describe.configure({ mode: 'parallel' });

    test('01 — Homepage: filtros desporto e região sincronizam URL', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      await page.getByRole('button', { name: 'Kitesurf', exact: true }).click();
      await expect(page).toHaveURL(/sport=kitesurf/);
      await expect(page.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute('aria-pressed', 'true');

      await page.getByRole('button', { name: 'Algarve', exact: true }).click();
      await expect(page).toHaveURL(/region=Algarve/);

      await page.reload();
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await expect(page.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Algarve', exact: true })).toHaveAttribute('aria-pressed', 'true');

      await page.getByRole('button', { name: /Limpar filtros|Clear filters/i }).click();
      await expect(page).not.toHaveURL(/sport=/);
      await context.close();
    });

    test('02 — Homepage: mapa Leaflet carrega', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');
      await page.waitForSelector('.leaflet-container', { timeout: 20_000 });
      await expect(page.locator('.leaflet-container')).toBeVisible();
      await context.close();
    });

    test('03 — Header: pesquisa abre, navega e fecha com Escape', async ({ browser }) => {
      const context = await browser.newContext();
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
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      const themeBtn = page.getByRole('banner').getByRole('button', {
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
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      if (viewport === 'mobile') {
        await openMobileMenu(page);
        await page.getByRole('link', { name: /Switch to English/i }).click();
      } else {
        await page.getByRole('link', { name: /Switch to English/i }).click();
      }
      await expect(page).toHaveURL(/\/en\/?$/);
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('06 — Navegação principal: todas as páginas carregam', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);

      const routes: { label: RegExp; url: RegExp }[] = [
        { label: /Explorar|Explore/i, url: /\/pt\/explorar\/?/ },
        { label: /Sazonalidade|Seasonality/i, url: /\/pt\/sazonalidade\/?/ },
        { label: /Comparar|Compare/i, url: /\/pt\/compare\/?/ },
        { label: /Livecams/i, url: /\/pt\/livecams\/?/ },
        { label: /Favoritos|Favorites/i, url: /\/pt\/favorites\/?/ },
        { label: /Notícias|News/i, url: /\/pt\/news\/?/ },
        { label: /Sobre|About/i, url: /\/pt\/about\/?/ },
      ];

      for (const route of routes) {
        await gotoHealthy(page, health, '/pt/');
        if (viewport === 'mobile') {
          await openMobileMenu(page);
          await page.locator('#mobile-nav').getByRole('link', { name: route.label }).click();
        } else {
          await page.getByRole('navigation').getByRole('link', { name: route.label }).click();
        }
        await expect(page).toHaveURL(route.url, { timeout: 10_000 });
        await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      }
      await context.close();
    });

    test('07 — Desktop: mega menu modalidades → Surf', async ({ browser }) => {
      test.skip(viewport === 'mobile', 'Mega menu só existe em desktop');
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      await page.getByRole('button', { name: /Modalidades/i }).hover();
      await expect(page.getByRole('button', { name: /Modalidades/i })).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#mega-menu-modalidades')).toBeVisible();
      await page.locator('#mega-menu-modalidades a[href="/pt/modalidades/surf/"]').click();
      await expect(page).toHaveURL(/\/pt\/modalidades\/surf\/?/);
      await expect(page.getByRole('heading', { level: 1, name: /Surf/i })).toBeVisible();
      await context.close();
    });

    test('08 — Mobile: menu hamburger abre e fecha', async ({ browser }) => {
      test.skip(viewport === 'desktop', 'Hamburger só em mobile');
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/');

      await openMobileMenu(page);
      await expect(page.locator('#mobile-nav').getByRole('link', { name: /Explorar/i })).toBeVisible();

      await page.getByRole('button', { name: /Fechar menu|Close menu/i }).click();
      await expect(page.locator('#mobile-nav')).toHaveAttribute('aria-hidden', 'true');
      await context.close();
    });

    test('09 — Compare: seleccionar 2 spots e comparar', async ({ browser }) => {
      const context = await browser.newContext();
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

    test('10 — Favoritos: adicionar e remover spot', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);

      await gotoHealthy(page, health, '/pt/');
      await page.evaluate(() => localStorage.setItem('windspot-favorites', '[]'));

      await gotoHealthy(page, health, '/pt/spots/guincho/');
      await page.getByRole('button', { name: /Adicionar Guincho aos favoritos/i }).click();
      await expect(
        page.getByRole('button', { name: /Remover Guincho dos favoritos/i }),
      ).toHaveAttribute('aria-pressed', 'true');

      await page.goto('/pt/favorites/');
      await expect(page.locator('main')).toContainText(/Guincho/i, { timeout: 15_000 });

      await page.getByRole('button', { name: /Remover Guincho dos favoritos/i }).click();
      await expect(page.getByText(/Ainda não tens favoritos|No favorites yet/i)).toBeVisible();
      await context.close();
    });

    test('11 — Notícias: filtros categoria, data e limpar', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/news/');

      await page.getByRole('button', { name: /Surf/i }).first().click();
      await expect(page).toHaveURL(/category=surf/);

      await page.getByRole('button', { name: /7 dias|7 days/i }).click();
      await expect(page).toHaveURL(/period=7d/);

      await page.getByRole('button', { name: /Limpar filtros|Clear filters/i }).click();
      await expect(page).not.toHaveURL(/category=/);
      await context.close();
    });

    test('12 — Explorar: landing SEO navega correctamente', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/explorar/');

      const firstLanding = page.locator('main a[href*="/explorar/"]').first();
      const href = await firstLanding.getAttribute('href');
      expect(href).toBeTruthy();
      await firstLanding.click();
      await expect(page).toHaveURL(/\/pt\/explorar\/.+/);
      await assertHealthyPage(page, health, { strictNetwork: false, strictConsole: false });
      await context.close();
    });

    test('13 — Spot detail: conteúdo e voltar', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/spots/nazare/');

      await expect(page.locator('main')).toContainText(/Nazar/i, { timeout: 20_000 });
      await page.getByRole('link', { name: /Voltar|Back/i }).first().click();
      await expect(page).toHaveURL(/\/pt\/spots\/?/);
      await context.close();
    });

    test('14 — Logo: volta à homepage', async ({ browser }) => {
      const context = await browser.newContext();
      const { page, health } = await setupPage(context, viewport);
      await gotoHealthy(page, health, '/pt/about/');
      await page.getByRole('banner').getByRole('link', { name: /Ven/i }).click();
      await expect(page).toHaveURL(/\/pt\/?$/);
      await context.close();
    });

    test('15 — Sem erros JS não filtrados', async ({ browser }) => {
      const context = await browser.newContext();
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
