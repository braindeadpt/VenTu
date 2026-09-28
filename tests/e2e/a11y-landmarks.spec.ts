import { test, expect } from '@playwright/test';
import { waitHydrated } from './helpers/hydration';
import { installSupabaseMock } from './helpers/supabase-mock';

/**
 * Guarda de MARCOS E CABEÇALHOS no HTML do build (achados A2 e A5 da mega
 * audit de 2026-09-26).
 *
 * A2 — 720 de 2 618 páginas tinham DOIS `<main>`: o `layout.tsx` emite
 * `#main-content` e os ecrãs de diretório/admin emitiam outro por dentro. Um
 * documento só pode ter um `<main>`; o leitor de ecrã anunciava dois marcos
 * «principal» e o «saltar para o conteúdo» ficava ambíguo.
 *
 * A5 — `/auth/callback/` e `/admin/diretorio/` não tinham `<h1>` nenhum (e o
 * `<main>` levava 19–24 caracteres: uma página de passagem, mas sem cabeçalho
 * se alguém a abrisse directamente).
 *
 * Isto lê o HTML CRU do build (sem JS): é o que o browser recebe no primeiro
 * paint, antes de qualquer hidratação. O payload RSC repete markup, por isso
 * os `<script>` são removidos antes de contar.
 */

/** Rotas com `<main>` interno histórico (diretório + admin) e controlos. */
const MAIN_ROUTES = [
  '/pt/',
  '/pt/diretorio/',
  '/pt/diretorio/3-surfers/',
  '/pt/diretorio/gerir/',
  '/pt/admin/diretorio/',
  '/pt/admin/contributions/',
  '/pt/favorites/',
  '/pt/conta/',
  '/pt/spots/guincho/',
  '/en/diretorio/',
  '/es/admin/diretorio/',
];

/** Páginas que não tinham `<h1>` no build. */
const H1_ROUTES = [
  '/pt/auth/callback/',
  '/en/auth/callback/',
  '/pt/admin/diretorio/',
  '/pt/admin/contributions/',
];

const stripScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

test.describe('Um só <main> e um <h1> por página (HTML do build)', () => {
  for (const path of MAIN_ROUTES) {
    test(`${path} — exactamente um <main>`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.ok(), `GET ${path}`).toBe(true);
      const html = stripScripts(await res.text());

      const opens = html.match(/<main[\s>]/g) ?? [];
      const closes = html.match(/<\/main>/g) ?? [];
      expect(opens.length, `${path}: ${opens.length} <main> abertos`).toBe(1);
      expect(closes.length, `${path}: ${closes.length} </main>`).toBe(1);

      // O marco tem de ser o do layout (o `#main-content` que o skip-link usa).
      expect(html).toContain('<main id="main-content"');
    });
  }

  test('a DOM hidratada de /pt/diretorio/ mantém um só marco <main>', async ({ page }) => {
    await page.goto('/pt/diretorio/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHydrated(page);
    await expect(page.locator('main')).toHaveCount(1);
  });

  test('a DOM hidratada de uma ficha mantém um só marco <main>', async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto('/pt/diretorio/3-surfers/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHydrated(page);
    await expect(page.locator('main')).toHaveCount(1);
    // O conteúdo continua lá: a troca de `<main>` por `<div>` não pode esvaziar a página.
    await expect(page.locator('main')).toContainText(/3 Surfers/i);
  });

  for (const path of H1_ROUTES) {
    test(`${path} — tem <h1> no HTML do build`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.ok(), `GET ${path}`).toBe(true);
      const html = stripScripts(await res.text());

      const h1s = html.match(/<h1[\s>]/g) ?? [];
      expect(h1s.length, `${path}: ${h1s.length} <h1>`).toBeGreaterThanOrEqual(1);
      // Título com texto: não basta o elemento vazio.
      const inner = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
      expect(inner.replace(/<[^>]+>/g, '').trim().length, `${path}: <h1> sem texto`).toBeGreaterThan(2);
      // Continua a ser o primeiro cabeçalho do documento (quando há <h2>).
      const firstH2 = html.indexOf('<h2');
      if (firstH2 !== -1) expect(html.indexOf('<h1')).toBeLessThan(firstH2);
    });
  }
});
