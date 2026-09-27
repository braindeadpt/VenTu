import { test, expect, type APIRequestContext } from '@playwright/test';
import { installSupabaseMock, installSupabaseSignedIn } from './helpers/supabase-mock';
import { waitHydrated } from './helpers/hydration';

/**
 * Guarda das ÂNCORAS (achado A7 da mega audit de 2026-09-26).
 *
 * `/xx/alerts/` e `/xx/conta/` ligam a `/xx/favorites/#alertas`, mas o
 * `<section id="alertas">` do `FavoritesAlertsPanel` só monta depois da
 * hidratação (e só com sessão E favoritos): o link não saltava, e sem sessão
 * não havia destino nenhum. Medido: 5 provas (os 5 locales), o único caso em
 * 114 574 links internos.
 *
 * A correcção é a disciplina certa: o destino existe SEMPRE que o link é
 * mostrado — em todos os estados do cliente (esqueleto, sem sessão, com sessão
 * e sem favoritos, com o painel), logo também no HTML do build.
 *
 * Há dois níveis de prova:
 *   1. estático — o HTML do build de /xx/favorites/ já traz o `id` (é o que o
 *      browser tem no primeiro paint, antes de hidratar);
 *   2. vivo — com e sem sessão o destino existe, uma única vez, e o link de
 *      `/xx/alerts/` aterra lá (o hash fica no URL e o alvo está montado).
 * Mais um varrimento de TODOS os links com âncora das rotas comuns: qualquer
 * `href="rota#id"` do build tem de ter destino na rota alvo.
 */

const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];

const stripScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

test.describe('Âncora #alertas', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/favorites/ traz id="alertas" no HTML do build`, async ({ request }) => {
      const res = await request.get(`/${locale}/favorites/`);
      expect(res.ok(), `GET /${locale}/favorites/`).toBe(true);
      const html = stripScripts(await res.text());
      const hits = html.match(/id="alertas"/g) ?? [];
      expect(hits.length, `/${locale}/favorites/: ${hits.length} id="alertas"`).toBe(1);
    });
  }

  test('sem sessão: o destino existe e o link de /pt/alerts/ aterra lá', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/pt/alerts/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHydrated(page);

    // O CTA «Activar nos favoritos» da página de alertas — procurado pelo
    // destino, não pelo texto (que é traduzido nas 5 línguas).
    const link = page.locator('a[href$="/favorites/#alertas"]').first();
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toContain('/pt/favorites/#alertas');

    await link.click();
    await page.waitForURL(/\/pt\/favorites\/#alertas$/, { timeout: 30_000 });
    await waitHydrated(page);

    // Sem sessão a página mostra o convite a entrar — e é aí que o alvo vive.
    await expect(page.locator('#alertas')).toHaveCount(1);
    await expect(page.locator('#alertas')).toContainText(/Entrar com magic link/i);
    // O browser conseguiu saltar: o alvo está montado e é um destino real.
    expect(await page.evaluate(() => !!document.getElementById('alertas'))).toBe(true);
  });

  test('com sessão e favoritos: o destino é o painel de alertas', async ({ page }) => {
    await installSupabaseSignedIn(page);
    await page.goto('/pt/favorites/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHydrated(page);

    const anchor = page.locator('#alertas');
    await expect(anchor).toHaveCount(1, { timeout: 20_000 });
    await expect(anchor).toContainText(/alertas/i);
  });

  test('com sessão e sem favoritos: o destino continua a existir', async ({ page }) => {
    await installSupabaseSignedIn(page, { favoriteSpotIds: [] });
    await page.goto('/pt/favorites/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHydrated(page);

    await expect(page.locator('#alertas')).toHaveCount(1, { timeout: 20_000 });
  });
});

/** Rotas comuns onde se procura qualquer link com âncora. */
const SWEEP_ROUTES = [
  '/pt/',
  '/pt/alerts/',
  '/pt/conta/',
  '/pt/favorites/',
  '/pt/ferramentas/',
  '/pt/news/',
  '/pt/diretorio/',
  '/pt/spots/guincho/',
  '/pt/mapa/',
  '/en/alerts/',
  '/de/alerts/',
  '/es/conta/',
];

async function htmlOf(request: APIRequestContext, cache: Map<string, string>, path: string) {
  if (!cache.has(path)) {
    const res = await request.get(path);
    expect(res.ok(), `GET ${path} (destino de âncora)`).toBe(true);
    cache.set(path, stripScripts(await res.text()));
  }
  return cache.get(path)!;
}

/** `href` → [rota, id] — as âncoras só têm sentido para links internos. */
function hashLinks(html: string, route: string): Array<{ target: string; id: string }> {
  const out: Array<{ target: string; id: string }> = [];
  for (const m of html.matchAll(/href="([^"]*)#([A-Za-z][\w:.-]*)"/g)) {
    const rawPath = m[1];
    if (/^(https?:)?\/\//.test(rawPath) || /^(mailto|tel):/.test(rawPath)) continue;
    const target = rawPath === '' ? route : rawPath;
    out.push({ target: target.endsWith('/') ? target : `${target}/`, id: m[2] });
  }
  return out;
}

test('todos os links com âncora do build têm destino na rota alvo', async ({ request }) => {
  const cache = new Map<string, string>();
  const broken: string[] = [];
  let checked = 0;

  for (const route of SWEEP_ROUTES) {
    const html = await htmlOf(request, cache, route);
    for (const { target, id } of hashLinks(html, route)) {
      if (!target.startsWith('/')) continue;
      const targetHtml = await htmlOf(request, cache, target);
      checked++;
      if (!new RegExp(`id="${id}"`).test(targetHtml)) broken.push(`${route} → ${target}#${id}`);
    }
  }

  expect(checked, 'nenhum link com âncora encontrado — o selector mudou').toBeGreaterThan(10);
  expect(broken, `âncoras sem destino:\n${broken.join('\n')}`).toEqual([]);
});
