import { test, expect } from '@playwright/test';
import { openMapSpotSheet } from './helpers/map-sheet';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptMapHours } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';

test.describe('/pt/mapa fullscreen map', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
  });

  test('opens in fullscreen with HUD visible', async ({ page }) => {
    const mapShell = page.locator('[data-map-fullscreen="true"]');
    await expect(mapShell).toBeVisible({ timeout: 20_000 });
    await expect(mapShell).toHaveAttribute('data-map-hud', 'visible');
    await expect(page.getByRole('heading', { name: /Mapa de spots/i, level: 1 })).toBeAttached();
  });

  test('difficulty filter persists in localStorage', async ({ page }) => {
    await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
    // §5: o nível passou a select nativo com label «Nível» (era pill «Iniciante»).
    await page.getByRole('combobox', { name: /Nível|Level/i }).selectOption('beginner');
    const stored = await page.evaluate(() => localStorage.getItem('ventu:map:difficulty'));
    expect(stored).toBe('beginner');
  });

  test('marker opens sheet with directions and view spot', async ({ page }) => {
    const sheet = await openMapSpotSheet(page);

    const directions = sheet.getByRole('link', { name: /Como chegar/i });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir/);

    await expect(sheet.getByRole('link', { name: /Ver spot/i })).toBeVisible();

    await expect(
      sheet.getByRole('status', { name: /Confiança da previsão/i }),
    ).toBeVisible();
  });

  test('Escape closes sheet', async ({ page }) => {
    await openMapSpotSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });
  });

  test('mobile HUD collapses to show more map', async ({ page }) => {
    const hud = page.locator('[data-map-hud-collapsed]');
    // §5: os filtros do sheet vivem no estado «half»; o nível é um select
    // nativo «Nível» (antes era a pill «Iniciante» do HUD expandido).
    const levelSelect = page.getByRole('combobox', { name: /Nível|Level/i });
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');
    await expect(levelSelect).toBeHidden();

    await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
    await expect(levelSelect).toBeVisible();

    await page.getByRole('button', { name: /Ocultar filtros|Hide filters/i }).click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');
    await expect(levelSelect).toBeHidden();
  });

  test('exit and re-enter map without freezing', async ({ page }) => {
    test.setTimeout(90_000);

    await page.getByRole('button', { name: /Sair do ecrã inteiro|Exit full screen/i }).click();
    await page.waitForURL(/\/pt\/?$/, { timeout: 15_000 });

    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('');

    const mainOpacity = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      return main ? getComputedStyle(main).opacity : '1';
    });
    expect(Number(mainOpacity)).toBeGreaterThan(0.9);

    await page.getByRole('banner').getByRole('button', { name: /Pesquisar|Search/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.goto('/pt/mapa/');
    await page.waitForSelector('.leaflet-container', { timeout: 25_000 });
    await expect(page.locator('[data-map-fullscreen="true"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Sair do ecrã inteiro|Exit full screen/i }).click();
    await page.waitForURL(/\/pt\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('banner')).toBeVisible();
  });
});

test.describe('/pt/mapa SEO', () => {
  test('canonical link uses trailing slash', async ({ page }) => {
    await page.goto('/pt/mapa/');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/pt\/mapa\/$/);
  });

  test('EN map page title', async ({ page }) => {
    await page.goto('/en/mapa/');
    await expect(page).toHaveTitle(/Spots map — VenTu/i);
  });
});

/**
 * #273 (v7 «Porta do mapa», fase A): a home passa o contexto ao /mapa pelo URL.
 *  - `?t=10&dia=1` → a régua de 48 h chega na frame de AMANHÃ mais próxima das 10h
 *    (sem `dia`, o `?t=` cai na hora de hoje, como sempre);
 *  - `?spot=guincho&de=home` → o detalhe do spot abre (pré-visualização no desktop, sheet no
 *    telemóvel); `?spot=guincho` sem `de` fica exactamente como hoje (caso de controlo).
 */
const lisboa = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date())
    .filter((x) => x.type !== 'literal')
    .map((x) => [x.type, x.value]),
);
const diaLisboa = (desvio: number) =>
  new Date(Date.UTC(Number(lisboa.year), Number(lisboa.month) - 1, Number(lisboa.day) + desvio)).toISOString().slice(0, 10);
// 16 passos de 3 h ancorados agora (horas ≡ 2 mod 3, como o stub do map-hud): 08h e 11h existem em todos os dias
const horaAgora = Number(lisboa.hour) % 24;
const recua = (horaAgora - 2 + 24) % 3;
const TIMES_48H = Array.from({ length: 16 }, (_, i) => {
  const total = horaAgora - recua + i * 3;
  const dia = Math.floor(total / 24);
  return `${diaLisboa(dia)}T${String(((total % 24) + 24) % 24).padStart(2, '0')}:00`;
});
const HOURS_STUB = {
  generatedAt: new Date().toISOString(),
  stepHours: 3,
  times: TIMES_48H,
  sports: ['surf', 'kitesurf'],
  spots: { guincho: { best: TIMES_48H.map(() => 40), surf: TIMES_48H.map(() => 40), kitesurf: TIMES_48H.map(() => 40) } },
};

async function abreMapa(page: import('@playwright/test').Page, query: string) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.removeItem('ventu.map.cluster');
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
  });
  await interceptMapHours(page, HOURS_STUB);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

test.describe('#273 home → /mapa: ?dia= e ?de=home', () => {
  test.describe('desktop 1440', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('?t=10&dia=1 chega na frame de amanhã (11h), não na de hoje', async ({ page }) => {
      const amanha11 = TIMES_48H.indexOf(`${diaLisboa(1)}T11:00`);
      expect(amanha11, 'a grelha de 48 h cobre amanhã às 11h').toBeGreaterThan(0);
      await abreMapa(page, '?sport=kitesurf&wind=1&t=10&dia=1&lat=39.35&lon=-8.95&z=7&de=home');
      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await expect(slider).toHaveValue(String(amanha11));
      await expect(track).toContainText('11:00');
    });

    test('?t=10 sem dia: o comportamento de sempre (a 1.ª frame cuja hora do dia é a mais próxima)', async ({ page }) => {
      const esperado = TIMES_48H.findIndex((t) => t.endsWith('T11:00'));
      await abreMapa(page, '?sport=kitesurf&t=10');
      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await expect(slider).toHaveValue(String(esperado), { timeout: 15_000 });
    });

    test('?spot=guincho&de=home abre a pré-visualização do spot', async ({ page }) => {
      await abreMapa(page, '?sport=kitesurf&wind=1&t=14&lat=39.35&lon=-8.95&z=7&spot=guincho&de=home');
      const card = page.locator('[data-testid="map-spot-card"]');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toHaveAttribute('data-spot-id', 'guincho');
    });

    test('controlo: ?spot=guincho sem de → o mesmo de hoje (pré-visualização do deep link)', async ({ page }) => {
      await abreMapa(page, '?sport=kitesurf&spot=guincho');
      const card = page.locator('[data-testid="map-spot-card"]');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toHaveAttribute('data-spot-id', 'guincho');
      // o painel da lista continua lá, com a linha do spot focada
      await expect(page.locator('[data-map-panel] [data-spot-id="guincho"]')).toBeAttached();
    });
  });

  test.describe('telemóvel 390', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('?spot=guincho&de=home abre a sheet do spot', async ({ page }) => {
      await abreMapa(page, '?sport=kitesurf&wind=1&t=14&lat=39.35&lon=-8.95&z=6.5&spot=guincho&de=home');
      const sheet = page.locator('[data-testid="map-spot-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 20_000 });
      await expect(sheet).toContainText('Guincho');
    });

    test('controlo: ?spot=guincho sem de → o mesmo de hoje (sheet do spot)', async ({ page }) => {
      await abreMapa(page, '?sport=kitesurf&spot=guincho');
      const sheet = page.locator('[data-testid="map-spot-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 20_000 });
      await expect(sheet).toContainText('Guincho');
    });
  });
});
