import { test, expect } from '@playwright/test';

/**
 * Guarda do HTML da página de spot: o conteúdo tem de vir NO SÍTIO, não em
 * streaming.
 *
 * Auditoria 2026-09-26: com o loading.tsx de /spots e um
 * <Suspense fallback={null}> no page.tsx, o <main> saía vazio no shell
 * (`<!--$?--><template id="B:1">`) e o conteúdo vinha num
 * `<div hidden id="S:1">` depois do <footer>, trocado por um script no fim de
 * ~350 KB de HTML. Se o browser pintasse antes (runner lento, telemóvel na
 * primeira visita), via cabeçalho + rodapé e depois tudo saltava — CLS 0,65
 * no Lighthouse do CI. Este teste lê o HTML cru (sem JS) e falha se voltar.
 */
const SPOTS = ['guincho', 'nazare', 'supertubos'];

for (const slug of SPOTS) {
  test(`/pt/spots/${slug}/: H1 antes do rodapé e <main> sem boundary pendente`, async ({ request }) => {
    const res = await request.get(`/pt/spots/${slug}/`);
    expect(res.ok()).toBe(true);
    const html = await res.text();
    // Só markup: os <script> (payload RSC, JSON-LD) repetem texto da página.
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');

    const h1 = markup.indexOf('<h1');
    const footer = markup.indexOf('<footer');
    expect(h1, 'o H1 do spot tem de estar no markup').toBeGreaterThanOrEqual(0);
    expect(footer, 'o rodapé tem de estar no markup').toBeGreaterThan(0);
    expect(h1, 'H1 depois do rodapé = página em streaming (CLS no primeiro paint)').toBeLessThan(footer);

    const mainStart = markup.indexOf('<main');
    const mainEnd = markup.indexOf('</main>');
    expect(mainStart).toBeGreaterThanOrEqual(0);
    const main = markup.slice(mainStart, mainEnd);
    expect(main, '<main> com boundary pendente (<!--$?-->) = conteúdo fora do sítio').not.toContain('<!--$?-->');
  });
}
