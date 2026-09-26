import { test, expect, type Page } from '@playwright/test';

/**
 * SP-A §8 — o conteúdo da página do spot tem de estar RESERVADO antes de o
 * script que resolve a fronteira RSC correr.
 *
 * O bug (medido a 390 px, 26 set): a página envolvia o `SpotDetailClient` num
 * `<Suspense fallback={null}>`. Num export estático essa fronteira não é
 * resolvida no build — o HTML servido traz `<!--$?--><template id="B:1">`
 * dentro do `<main>` e o conteúdo verdadeiro vai num `<div hidden id="S:1">`
 * DEPOIS do rodapé, trocado por script. Com `fallback={null}` o `<main>`
 * reservava ZERO e, como o `<footer>` vem logo a seguir a `</main>`, era ele o
 * primeiro conteúdo pintado (y=64). Quando a fronteira resolvia, o rodapé
 * descia ~4700 px: uma única entrada de layout-shift de **0,7133** atribuída ao
 * `footer` (`prev 390×602` em y=64 → `cur 0×0`), ~0,85 de CLS total da página.
 *
 * Correção: a fronteira sai — nada na árvore usa `useSearchParams` (o deep link
 * `?sport=` é lido no cliente, ver o comentário em SpotDetailClient) — e o
 * `<main>` passa a trazer o esqueleto do segmento (`spots/loading.tsx`), que
 * reserva a altura da viewport: o rodapé fica abaixo da dobra desde o primeiro
 * paint. Medido a 390 px: 0,8538 → 0,032.
 *
 * Três provas, de propósito:
 *  - a ESTRUTURAL é determinística (lê o HTML exportado e exige `<main>` com
 *    conteúdo real): era o `fallback={null}` que a punha a zero. Corre sem
 *    browser e sem depender de tempo — é ela que impede a regressão;
 *  - a de CLS é empírica e corre com o chunk que resolve a fronteira ATRASADO
 *    (400 ms). Num servidor local o reveal pode ganhar à primeira pintura e a
 *    página medir 0,066 MESMO com o defeito — sem o atraso, este teste podia
 *    passar sem medir nada. Atrasado, o defeito dá ~0,85 e a correção ~0,03.
 *
 *  - a terceira é o preço da remoção: a fronteira só era justificável pelo
 *    `useSearchParams` de um deep link `?sport=` que, afinal, é lido no cliente
 *    — por isso o deep link fica aqui testado (contra a modalidade por omissão,
 *    para não passar sem fazer nada).
 */

const SPOT_URL = '/pt/spots/guincho/';

/** Abaixo disto o `<main>` não reserva nada (era 0 com o `fallback={null}`);
 *  com o esqueleto do segmento são ~940 caracteres. */
const MAIN_MIN_CHARS = 400;

/** Atraso aplicado aos chunks para reproduzir o pior caso (reveal depois do
 *  primeiro paint) sem depender da velocidade da máquina. */
const REVEAL_DELAY_MS = 400;

const VIEWPORTS = [
  { name: '320', width: 320, height: 844 },
  { name: '390', width: 390, height: 844 },
  { name: '1350', width: 1350, height: 900 },
] as const;

interface Shift {
  t: number;
  value: number;
  footer: boolean;
  source: string;
}

/** Observador de `layout-shift` desde o primeiro frame (buffered), a marcar as
 *  entradas cuja caixa instável é (ou está dentro de) o rodapé. */
const CLS_PROBE = () => {
  const w = window as unknown as { __spotCls?: Shift[] };
  w.__spotCls = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as (PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources?: { node: Node | null }[];
    })[]) {
      if (e.hadRecentInput) continue;
      const sources = e.sources ?? [];
      w.__spotCls!.push({
        t: Math.round(e.startTime),
        value: e.value,
        footer: sources.some((s) => {
          const el = s.node as Element | null;
          if (!el || el.nodeType !== 1) return false;
          return el.tagName === 'FOOTER' || !!el.closest?.('footer');
        }),
        source: sources
          .map((s) => (s.node as Element | null)?.tagName ?? '?')
          .join(','),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

const readShifts = (page: Page): Promise<Shift[]> =>
  page.evaluate(() => (window as unknown as { __spotCls: Shift[] }).__spotCls);

async function openSpot(page: Page): Promise<void> {
  await page.goto(SPOT_URL);
  await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
  await page.waitForTimeout(1_500);
}

test('o <main> exportado não vem vazio — o rodapé não pode ser o primeiro conteúdo', async ({
  request,
}) => {
  const res = await request.get(SPOT_URL);
  expect(res.status()).toBe(200);
  const html = await res.text();

  const inner = /<main id="main-content"[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';
  expect(inner.length, 'HTML sem `<main id="main-content">`').toBeGreaterThan(0);

  // Sem comentários de streaming (`<!--$?-->`) nem `<template id="B:n">`: é
  // exactamente o que sobrava quando o `<main>` reservava zero.
  const reservado = inner
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<template[\s\S]*?<\/template>/g, '')
    .trim();

  expect(
    reservado.length,
    `o <main> exportado reserva ${reservado.length} caracteres — a fronteira RSC não está a ser pré-resolvida`,
  ).toBeGreaterThan(MAIN_MIN_CHARS);
});

test('o deep link ?sport= continua a escolher a modalidade sem a fronteira', async ({ page }) => {
  // A fronteira existia por causa do `useSearchParams` — que o SpotDetailClient
  // NUNCA chegou a usar (lê `window.location.search` depois de hidratar). Sem
  // cobertura, remover a fronteira podia levar o deep link com ela.
  test.setTimeout(120_000);

  // Qual é a modalidade por omissão (a de melhor score)? Lê-se da página, em
  // vez de fixada: assim o controlo não depende dos dados do dia.
  const page2 = await page.context().newPage();
  await page2.goto(SPOT_URL);
  await page2.waitForSelector('html.is-hydrated', { timeout: 40_000 });
  await expect(page2.locator('[role="tab"][aria-selected="true"]')).toBeVisible({
    timeout: 40_000,
  });
  const porOmissao = await page2.evaluate(
    () => document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? '',
  );
  await page2.close();
  expect(porOmissao).toMatch(/^sport-tab-/);

  // Uma OUTRA modalidade que o Guincho oferece — o URL tem de vencer.
  const outro = porOmissao === 'sport-tab-kitesurf' ? 'surf' : 'kitesurf';
  await page.goto(`${SPOT_URL}?sport=${outro}`);
  await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
  const aba = page.locator(`#sport-tab-${outro}`);
  await expect(aba).toBeVisible({ timeout: 40_000 });
  await expect(aba).toHaveAttribute('aria-selected', 'true');
  // E a modalidade por omissão deixou de estar seleccionada.
  await expect(page.locator(`#${porOmissao}`)).toHaveAttribute('aria-selected', 'false');
});

for (const vp of VIEWPORTS) {
  test.describe(`SP-A §8 rodapé @ ${vp.name}px`, () => {
    test.use({
      serviceWorkers: 'block',
      viewport: { width: vp.width, height: vp.height },
    });

    test('a página não troca o rodapé pelo conteúdo (CLS)', async ({ page }) => {
      test.setTimeout(120_000);
      await page.route('**/_next/static/chunks/**', async (route) => {
        await new Promise((r) => setTimeout(r, REVEAL_DELAY_MS));
        await route.continue();
      });
      await page.addInitScript(CLS_PROBE);

      await openSpot(page);

      const shifts = await readShifts(page);
      const total = shifts.reduce((a, s) => a + s.value, 0);

      // 0,1 é o limiar «bom» do Core Web Vitals; o defeito dava ~0,85.
      expect(
        total,
        `CLS total ${total.toFixed(4)} — entradas: ${JSON.stringify(shifts)}`,
      ).toBeLessThan(0.1);

      // A entrada que define o defeito: o rodapé a saltar de dentro da dobra
      // (0,7133). A ≥1350 px o rodapé nunca está na dobra, por isso esta
      // asserção é aí trivial — a de cima é que continua a valer.
      const rodape = shifts.filter((s) => s.footer && s.value > 0.05);
      expect(rodape, `rodapé a saltar: ${JSON.stringify(rodape)}`).toEqual([]);

      // ── Controlo: repor o DEFEITO no DOM — o `<main>` a colapsar faz o
      //    rodapé subir para dentro da dobra, que é o mesmo movimento (ao
      //    contrário) que foi medido em produção. Sem esta prova, a asserção
      //    acima podia passar por o observador estar cego.
      //    (Rolar até ao fundo e encolher uma secção NÃO serve: o scroll
      //    anchoring do Chrome compensa e o shift nunca é reportado.)
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const m = document.querySelector('main') as HTMLElement | null;
        if (m) {
          m.style.height = '0px';
          m.style.overflow = 'hidden';
        }
      });
      await page.waitForTimeout(400);

      const depois = await readShifts(page);
      expect(
        depois.some((s) => s.footer && s.value > 0.05),
        `o observador não viu o rodapé a saltar para a dobra: ${JSON.stringify(depois)}`,
      ).toBe(true);
    });
  });
}
