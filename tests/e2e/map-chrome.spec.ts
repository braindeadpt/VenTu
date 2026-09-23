import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Cromo do /mapa — UX v3 §1–§4 (M2). A barra do topo desapareceu e cada
 * coisa foi para o destino da spec:
 *
 *  1. Cabeçalho compacto de 48 px só em /mapa + mapa a ocupar o resto;
 *     atribuição única (controlo Leaflet à direita do painel no desktop,
 *     dentro do sheet no mobile).
 *  2. Pilha de controlos à direita (role=toolbar): zoom só pointer:fine,
 *     Localizar · Camadas · Vento · Legenda · Partilhar — tooltips no
 *     hover, toggles com aria-pressed.
 *  3. Pill «Agora · HH:MM» no topo ao centro + scrubber de 48 h ancorado
 *     em baixo (barras por escalão, ticks canónicos, play/pause, «Agora»).
 *  4. Legenda flutuante com 5 escalões discretos e rótulos canónicos
 *     (getScoreTierLabel) + intervalos; aberta por defeito no desktop,
 *     fechada no mobile; preferência em localStorage.
 *
 * Aceitação §12: nenhuma sobreposição de cromo a 390/768/1440 medida por
 * bounding boxes; nenhum texto com reticências a transbordar.
 */

const SPORTS = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const;

/** 16 passos × 3 h — a régua do scrubber (mesmo formato do map-hud). */
const TIMES = Array.from({ length: 16 }, (_, i) => {
  const h = 8 + i * 3;
  const day = 3 + Math.floor(h / 24);
  const hh = String(h % 24).padStart(2, '0');
  return `2026-09-${String(day).padStart(2, '0')}T${hh}:00`;
});

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: { best: TIMES.map((_, i) => (i === 3 ? 88 : 40)) },
  },
};

async function openMapa(page: Page, query = ''): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.mapdebug', '1'); // expõe __VENTU_MAP__ p/ asserts de zoom
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

interface Box { left: number; right: number; top: number; bottom: number }

function overlap(a: Box, b: Box): boolean {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

/** Bounding boxes dos elementos de cromo presentes (só os visíveis). */
async function chromeBoxes(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, { left: number; right: number; top: number; bottom: number }> = {};
    const sels: Record<string, string> = {
      stack: '[data-map-control-stack]',
      pill: '[data-map-time-pill]',
      legend: '[data-map-legend-card]',
      scrub: '[data-map-hours-scrubber]',
      panel: '[data-map-panel="open"], [data-map-panel="rail"]',
      sheet: '[data-explore-sheet]',
      attribution: '.leaflet-control-attribution',
    };
    for (const [key, sel] of Object.entries(sels)) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // Elemento presente mas sem caixa (display:none) não colide.
      if (r.width === 0 || r.height === 0) continue;
      out[key] = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
    return out;
  });
}

test.describe('Cromo do /mapa — UX v3 §1–§4', () => {
  test.describe.configure({ timeout: 90_000 });

  // ── §1 — cabeçalho compacto + atribuição única ──────────────────────
  test.describe('§1 cabeçalho compacto e atribuição', () => {
    test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('header de 48 px só em /mapa e o shell do mapa cola-se a ele', async ({ page }) => {
      await openMapa(page);

      const geo = await page.evaluate(() => {
        const header = document.querySelector('header.site-header');
        const shell = document.querySelector('[data-map-fullscreen="true"]');
        if (!header || !shell) return null;
        const h = header.getBoundingClientRect();
        const m = shell.getBoundingClientRect();
        return { headerH: Math.round(h.height), mapTop: Math.round(m.top), mapBottom: Math.round(m.bottom), vh: innerHeight };
      });
      expect(geo).not.toBeNull();
      // h-12 interior + border-b 1 px = 49 px de caixa (a convenção do
      // header antigo era idêntica: h-16 + borda = 65 px).
      expect(geo!.headerH).toBeGreaterThanOrEqual(48);
      expect(geo!.headerH).toBeLessThanOrEqual(49);
      expect(geo!.mapTop).toBe(48);
      expect(geo!.mapBottom).toBe(geo!.vh);

      // As outras rotas mantêm o header de 64 px (+borda = 65).
      await page.goto('/pt/spots/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const h2 = await page.evaluate(() =>
        Math.round(document.querySelector('header.site-header')!.getBoundingClientRect().height),
      );
      expect(h2).toBeGreaterThanOrEqual(64);
      expect(h2).toBeLessThanOrEqual(65);
    });

    test('a atribuição aparece uma vez e à direita do painel', async ({ page }) => {
      await openMapa(page);

      const attr = page.locator('.leaflet-control-attribution');
      await expect(attr).toBeVisible({ timeout: 15_000 });
      // O espelho textual do painel está oculto — uma só superfície.
      const mirrors = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-attribution]'));
        return els.filter((el) => el.getBoundingClientRect().width > 0).length;
      });
      expect(mirrors).toBe(0);

      const geo = await page.evaluate(() => {
        const a = document.querySelector('.leaflet-control-attribution')!.getBoundingClientRect();
        const p = document.querySelector('[data-map-panel="open"]')?.getBoundingClientRect();
        return p ? { attrLeft: Math.round(a.left), panelRight: Math.round(p.right) } : { attrLeft: Math.round(a.left), panelRight: null };
      });
      expect(geo.panelRight).not.toBeNull();
      expect(geo.attrLeft).toBeGreaterThanOrEqual(geo.panelRight!);
    });
  });

  // ── §2 — pilha de controlos ─────────────────────────────────────────
  test.describe('§2 pilha de controlos', () => {
    test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('ordem, alvos ≥44 px e toggles com aria-pressed', async ({ page }) => {
      await openMapa(page);

      const stack = page.locator('[data-map-control-stack]');
      await expect(stack).toBeVisible();
      await expect(stack).toHaveAttribute('role', 'toolbar');
      await expect(stack).toHaveAttribute('aria-orientation', 'vertical');

      // Zoom (pointer:fine) + Localizar + Camadas + Vento + Legenda + Partilhar.
      await expect(stack.locator('[data-map-zoom-in]')).toBeVisible();
      await expect(stack.locator('[data-map-zoom-out]')).toBeVisible();
      for (const sel of ['[data-map-locate]', '[data-map-layers-menu]', '[data-map-wind-toggle]', '[data-map-legend-toggle]', '[data-map-share]']) {
        const btn = stack.locator(sel);
        await expect(btn, sel).toBeVisible();
        const box = await btn.boundingBox();
        expect(box, `${sel} com caixa`).not.toBeNull();
        expect(box!.width, `${sel} largura`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${sel} altura`).toBeGreaterThanOrEqual(44);
      }

      // Toggles com estado em aria-pressed (§0.3): Vento e Legenda.
      await expect(stack.locator('[data-map-wind-toggle]')).toHaveAttribute('aria-pressed', /true|false/);
      await expect(stack.locator('[data-map-legend-toggle]')).toHaveAttribute('aria-pressed', 'true');

      // O zoom funciona sobre a instância Leaflet (sem o controlo nativo).
      await expect(page.locator('.leaflet-control-zoom')).toBeHidden();
      const z0 = await page.evaluate(() => (window as unknown as { __VENTU_MAP__?: { getZoom(): number } }).__VENTU_MAP__?.getZoom());
      await stack.locator('[data-map-zoom-in]').click();
      await expect
        .poll(async () => page.evaluate(() => (window as unknown as { __VENTU_MAP__?: { getZoom(): number } }).__VENTU_MAP__?.getZoom()), { timeout: 10_000 })
        .toBe((z0 ?? 0) + 1);
    });

    test('a antiga barra do topo e os quick actions desapareceram', async ({ page }) => {
      await openMapa(page);
      // Pill centrado do topo (embeds) não existe no /mapa.
      await expect(page.locator('.absolute.top-3.left-1\\/2[data-map-controls]')).toHaveCount(0);
      // «Só a bombar» e «Mostrar todos» não estão no cromo.
      await expect(page.locator('[data-map-controls] [data-map-only-on-toggle]')).toHaveCount(0);
    });
  });

  // ── §3 — pill + scrubber 48 h ───────────────────────────────────────
  test.describe('§3 pill de tempo e scrubber', () => {
    test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('pill abre o scrubber; «Agora» volta ao frame 0; teclado no slider', async ({ page }) => {
      await openMapa(page);

      const pill = page.locator('[data-map-time-pill]');
      await expect(pill).toBeVisible({ timeout: 15_000 });
      await expect(pill).toContainText('Agora');
      await expect(pill).toHaveAttribute('aria-expanded', 'false');

      // Abrir pela pill liga a camada «48 h» e mostra as barras.
      await pill.click();
      const scrub = page.locator('[data-map-hours-scrubber]');
      await expect(scrub).toBeVisible({ timeout: 15_000 });
      await expect(pill).toHaveAttribute('aria-expanded', 'true');
      await expect(pill).toContainText('Agora ·');

      // Scrub para o passo 3 (17:00) — o pill passa a futuro.
      const slider = scrub.locator('input[type="range"]');
      await slider.fill('3');
      await expect(pill).toContainText('17:00');
      await expect(scrub.locator('b')).toContainText('17:00');

      // «Agora» repõe o frame 0.
      await scrub.locator('[data-map-hours-now]').click();
      await expect(pill).toContainText('Agora ·');

      // Teclado no slider invisível (setas/Home/End são nativas do range).
      await slider.focus();
      await page.keyboard.press('End');
      await expect(pill).toContainText('05:00'); // último passo = dia 5, 05:00
      await page.keyboard.press('Home');
      await expect(pill).toContainText('Agora ·');

      // A pill fecha o scrubber; a camada fica ligada.
      await pill.click();
      await expect(scrub).toHaveCount(0);
      await expect(pill).toHaveAttribute('aria-expanded', 'false');
    });

    test('menu «Camadas» liga «48 h» e abre o scrubber', async ({ page }) => {
      await openMapa(page);
      await page.locator('[data-map-control-stack] [data-map-layers-menu]').click();
      const hours = page.locator('[data-map-layers-popover] [data-map-hours-toggle]');
      await expect(hours).toBeVisible({ timeout: 10_000 });
      await hours.click();
      await expect(page.locator('[data-map-hours-scrubber]')).toBeVisible({ timeout: 15_000 });
    });
  });

  // ── §4 — legenda ────────────────────────────────────────────────────
  test.describe('§4 legenda', () => {
    test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('5 escalões discretos com rótulos e intervalos canónicos', async ({ page }) => {
      await openMapa(page);

      const legend = page.locator('[data-map-legend-card]');
      await expect(legend).toBeVisible({ timeout: 10_000 }); // desktop: aberta por defeito

      // Rótulos canónicos (getScoreTierLabel) + intervalos 80–100 … 0–19.
      for (const label of ['Épico', 'Bom', 'Razoável', 'Fraco', 'Fechado']) {
        await expect(legend).toContainText(label);
      }
      for (const range of ['80–100', '60–79', '40–59', '20–39', '0–19']) {
        await expect(legend).toContainText(range);
      }

      // O toggle da pilha fecha e grava a preferência (localStorage).
      const toggle = page.locator('[data-map-legend-toggle]');
      await toggle.click();
      await expect(legend).toHaveCount(0);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(await page.evaluate(() => localStorage.getItem('ventu.map.legend'))).toBe('0');

      // Recarrega → preferência honrada (fechada).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
      await waitHydrated(page);
      await expect(page.locator('[data-map-legend-card]')).toHaveCount(0);
    });

    test('com o vento ligado a legenda mostra amostras de traço', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('ventu.map.wind', '1');
      });
      await openMapa(page);
      const legend = page.locator('[data-map-legend-card]');
      await expect(legend).toBeVisible({ timeout: 10_000 });
      await expect(legend.locator('[data-map-wind-legend]')).toBeVisible();
      for (const label of ['5 kt', '15 kt', '25+ kt']) {
        await expect(legend.locator('[data-map-wind-legend]')).toContainText(label);
      }
    });
  });

  // ── §12 — colisão do cromo (bounding boxes) ─────────────────────────
  for (const vp of [
    { name: 'mobile 390', width: 390, height: 844, touch: true },
    { name: 'tablet 768', width: 768, height: 1024, touch: true },
    { name: 'desktop 1440', width: 1440, height: 900, touch: false },
  ]) {
    test.describe(`colisão ${vp.name}`, () => {
      test.use({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.touch,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });

      test('nenhum elemento de cromo se sobrepõe', async ({ page }) => {
        await openMapa(page, '?hours=1');

        // Mobile: a legenda nasce fechada — abrir para a incluir na medição.
        // O teto de altura é medido por rAF (segue o sheet/scrubber) —
        // esperar uns frames antes de medir as caixas.
        if (vp.touch && vp.width < 768) {
          const toggle = page.locator('[data-map-legend-toggle]');
          if (await toggle.isVisible()) await toggle.click();
          await page.waitForTimeout(300);
        }

        await expect(page.locator('[data-map-time-pill]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-map-hours-scrubber]')).toBeVisible({ timeout: 15_000 });

        const boxes = await chromeBoxes(page);
        const keys = Object.keys(boxes);
        expect(keys).toContain('stack');
        expect(keys).toContain('pill');
        const collisions: string[] = [];
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            // A atribuição e o painel/sheet são superfícies medidas à parte
            // (o controlo Leaflet vive dentro do rect do painel quando aberto
            // — vê o teste de offset em §1).
            if (keys[i] === 'attribution' || keys[j] === 'attribution') continue;
            if (overlap(boxes[keys[i]], boxes[keys[j]])) {
              collisions.push(`${keys[i]} ∩ ${keys[j]}`);
            }
          }
        }
        expect(collisions, `colisões de cromo a ${vp.width}px`).toEqual([]);
      });

      test('nenhum texto do cromo transborda (scrollWidth > clientWidth)', async ({ page }) => {
        await openMapa(page, '?hours=1');
        await expect(page.locator('[data-map-time-pill]')).toBeVisible({ timeout: 15_000 });

        const overflowing = await page.evaluate(() => {
          const out: string[] = [];
          const scopes = ['[data-map-control-stack]', '[data-map-time-pill]', '[data-map-legend-card]', '[data-map-hours-scrubber]'];
          for (const sel of scopes) {
            document.querySelectorAll<HTMLElement>(`${sel} *`).forEach((el) => {
              if (el.classList.contains('sr-only')) return; // clip 1 px intencional
              if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1) {
                out.push(`${sel} → ${el.tagName}.${el.className} «${el.textContent?.slice(0, 40)}»`);
              }
            });
          }
          return out;
        });
        expect(overflowing).toEqual([]);
      });
    });
  }
});
