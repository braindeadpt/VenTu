import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock } from './helpers/supabase-mock';
import { waitHydrated } from './helpers/hydration';

/**
 * Guarda dos ALVOS DE TOQUE (achado A4 da mega audit de 2026-09-26).
 *
 * Convenção do próprio projecto: controlos com ≥44 px de ALTURA (é o que o
 * `map-touch-targets`, o `map-hud` e o `FilterPill` já impõem). Medido antes do
 * fix: 111 provas em 30 rotas a 390 px — ✕ do aviso de locale (22×22), pílulas
 * dos calculadores (36), inputs de texto (42), selects (33), paginação (40).
 *
 * Regras da medição (as mesmas do harness da mega audit, `audit-invariants`):
 *   - a ALTURA é que manda (`alvo-estreito`, só largura, é informativo);
 *   - `<a>` de texto corrido é isento (WCAG 2.5.8) e o `sr-only` não é alvo;
 *   - a área de toque de um checkbox/rádio é o `<label>` que o envolve (é ele
 *     que recebe o clique) — mede-se o label;
 *   - os marcadores/camadas do Leaflet saem fora: o mapa tem regras próprias
 *     (`map-touch-targets`, `map-hud`).
 */
const ROUTES = [
  // o aviso de locale (✕ de 22×22) só existe em es/de/fr
  '/de/',
  '/en/',
  // pílulas de 36 px
  '/pt/diretorio/',
  '/pt/news/',
  '/pt/ferramentas/calculadora-kite/',
  '/pt/ferramentas/calculadora-fato/',
  // inputs de 42/33 px e paginação de 40
  '/pt/news/',
  '/pt/conta/',
  '/pt/alerts/',
  '/pt/favorites/',
  '/pt/spots/guincho/',
  // NOTA: `/pt/mapa/` fica DE FORA — não é um componente partilhado, é o HUD do
  // mapa (chrome do tempo + sheet de explorar), com desenho e specs próprios
  // (`map-hud`, `map-touch-targets`). Medido à parte com `hasTouch: true`, que é
  // o que faz o mapa renderizar o chrome de toque: 4 controlos abaixo de 44 px
  // («Agora» 86×40, play/prev/next 36×36, «Filtros» 94×40 e a barra de arrasto
  // 372×26) — fica registado como trabalho do mapa, não destes componentes.
];

/**
 * NOTA: passa-se uma FUNÇÃO, não uma string. O Playwright avalia uma string
 * como EXPRESSÃO: uma arrow function entrega-se a si mesma e serializa para
 * `undefined` (a mesma armadilha documentada em `helpers/settle.ts`).
 */
function measure(): string[] {
  const out: string[] = [];
  // CONTROLES. `a[href]` de texto fica de fora: a WCAG 2.5.8 isenta links de
  // texto corrido e o repo mede-os em separado e a nível informativo
  // (`link-baixo` no harness da mega audit: 222 provas, isentas).
  const selector =
    'button:not([disabled]), [role="button"], [role="tab"], [role="switch"], [role="menuitem"], select, input:not([type="hidden"]), textarea, summary';
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('.sr-only')) continue;
    if (el.closest('.leaflet-container')) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    let box = r;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) {
      const label = el.closest('label');
      if (label) box = label.getBoundingClientRect();
    }
    if (box.height < 44) {
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      out.push(
        el.tagName.toLowerCase() +
          (el.id ? '#' + el.id : '') +
          (text ? ' «' + text + '»' : '') +
          ' ' + Math.round(box.width) + 'x' + Math.round(box.height),
      );
    }
  }
  return out;
}

async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(measure);
}

test.describe('Alvos de toque ≥44 px (390 px, touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  for (const route of [...new Set(ROUTES)]) {
    test(`${route} — nenhum controlo abaixo de 44 px de altura`, async ({ page }) => {
      test.setTimeout(60_000);
      await installSupabaseMock(page);
      // O aviso de locale lê o localStorage num efeito: entra logo (sem dispensa).
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await waitHydrated(page);
      // Página assentada (fontes + animações) antes de medir.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);

      const found = await offenders(page);
      expect(found, `${route}\n${found.join('\n')}`).toEqual([]);
    });
  }

  test('o ✕ do aviso de locale serve 44×44 sem mudar a faixa', async ({ page }) => {
    await page.goto('/de/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHydrated(page);
    const notice = page.locator('[data-partial-locale-notice]');
    await expect(notice).toBeVisible({ timeout: 15_000 });
    const close = notice.getByRole('button');
    const box = (await close.boundingBox())!;
    expect(box.width, 'largura do ✕').toBeGreaterThanOrEqual(44);
    expect(box.height, 'altura do ✕').toBeGreaterThanOrEqual(44);

    // A faixa NÃO cresce por causa do alvo: mede-se com o alvo grande e, na
    // mesma corrida, com o alvo de volta ao tamanho desenhado — se a altura da
    // faixa for a mesma, o que cresceu foi só a área de toque (margem negativa).
    const withTarget = (await notice.boundingBox())!.height;
    await close.evaluate((el) => {
      const btn = el as HTMLElement;
      btn.style.minHeight = '0';
      btn.style.marginTop = '0';
      btn.style.marginBottom = '0';
    });
    const natural = (await notice.boundingBox())!.height;
    expect(Math.abs(withTarget - natural), `faixa ${withTarget}px vs ${natural}px sem o alvo`).toBeLessThanOrEqual(1);

    await close.click();
    await expect(notice).toHaveCount(0);
  });
});
