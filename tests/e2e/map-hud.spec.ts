import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { interceptMapHours, interceptRadar } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expectTopmostHit } from './helpers/hit-test';
import { expandMapHudFilters } from './helpers/map-hud';

/**
 * HUD «Modo explorar» do /mapa — garantias consolidadas num único ficheiro
 * (consolidação 2026-09-10; AUDIT-MAPA-VISUAL-2026-09).
 *
 * Secções:
 *  1. Colapso — o HUD arranca colapsado em TODAS as superfícies (decisão
 *     2026-09-10: as rows expandidas cobriam 30–43% do viewport do mapa no
 *     desktop, sonda scripts/audit/audit-hud-footprint.mjs). Orçamentos de
 *     cobertura e legenda sem colisão (hudLift via ResizeObserver).
 *  2. Alvos de toque (WCAG 2.5.8) — rádios Mapa/Satélite ≥44px (o «Satélite»
 *     chegou a ter 39px), pills ≥44px abaixo de lg e densidade 36px só em
 *     rato puro (`any-pointer: fine`, decisão V3′).
 *  3. Overflow / scroll / hit-test — as linhas de pills rolam dentro do
 *     cartão em 360px; o slider das horas não estoura o cartão (regressão
 *     min-w-0); os toggles de camadas são o elemento de topo do strip e
 *     persistem entre recargas (ventu.map.currents/sst/isobaths, ventu.radar.state).
 *  4. Time track (scrub) — deep links ?hours/?t, scrub 08h→17h muda o score,
 *     mobile incluído, e prefers-reduced-motion não anima sozinho.
 *
 * Absorve: map-hud-collapse (inteiro), os testes de HUD de map-touch-targets,
 * o slider estreito de map-hours e map-mobile-layer-toggles (inteiro).
 */

const SPORTS = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const;

/** 16 steps × 3 h from 08:00 Lisbon. Index 0 = 08h, index 3 = 17h (nearest to 18h). */
const TIMES = Array.from({ length: 16 }, (_, i) => {
  const h = 8 + i * 3;
  const day = 3 + Math.floor(h / 24);
  const hh = String(h % 24).padStart(2, '0');
  return `2026-09-${String(day).padStart(2, '0')}T${hh}:00`;
});

function series(at: Record<number, number>): number[] {
  return TIMES.map((_, i) => at[i] ?? 40);
}

function spotRow(at: Record<number, number>) {
  const s = series(at);
  const row: Record<string, number[]> = { best: s };
  for (const sport of SPORTS) row[sport] = s;
  return row;
}

/**
 * Fixture mínima — a que os specs originais do time track usavam (sem
 * correntes/SST): mantém a linha do track leve e determinística.
 */
const MAP_HOURS_MINIMAL_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
  },
};

/**
 * Fixture com correntes + SST → os toggles de camadas nascem disponíveis
 * (não disabled) na secção de hit-test dos toggles.
 */
const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
  },
  currents: {
    nazare: { spd: TIMES.map(() => 0.2), dir: TIMES.map(() => 190) },
  },
  sst: {
    nazare: series({}),
  },
};

const RADAR_STUB = {
  source: 'ipma-radar',
  fetchedAt: '2026-08-15T01:05:00.000Z',
  frameTime: '2026-08-15T01:00:00.000Z',
  framePath: 'pcr-2026-08-15T0100.png',
  imagePath: 'radar/ipma-radar.png',
  frames: [
    {
      frameTime: '2026-08-15T01:00:00.000Z',
      framePath: 'pcr-2026-08-15T0100.png',
      imagePath: 'radar/frames/pcr-2026-08-15T0100.png',
    },
  ],
  bounds: { south: 34.011513, west: -12.454795, north: 43.792862, east: -4.345465 },
  attribution: 'IPMA',
};

async function openMapa(
  page: Page,
  opts: { query?: string; radar?: boolean; layers?: boolean } = {},
): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, opts.layers ? MAP_HOURS_STUB : MAP_HOURS_MINIMAL_STUB);
  if (opts.radar) await interceptRadar(page, RADAR_STUB);
  await page.goto(`/pt/mapa/${opts.query ?? ''}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

async function expectMinTargetSize(
  locator: ReturnType<Page['locator']>,
  label: string,
) {
  const box = await locator.boundingBox();
  expect(box, `${label} deveria ter caixa mensurável`).not.toBeNull();
  expect(box!.width, `${label} largura`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} altura`).toBeGreaterThanOrEqual(44);
}

/**
 * Score do marcador da Nazaré com retry: o marcador pode renderizar antes do
 * stub das 48h ser aplicado (score de fallback) e só re-renderiza quando os
 * dados chegam — ler uma vez é uma corrida; esperar pelo valor é determinístico.
 */
async function expectNazareScore(page: Page, expected: string) {
  const score = page.locator(
    '.leaflet-marker-icon.spot-marker[aria-label="Nazaré"] [data-spot-score]',
  );
  await expect(score).toHaveAttribute('data-spot-score', expected, { timeout: 15_000 });
}

test.describe('HUD «Modo explorar» — garantias consolidadas', () => {
  test.describe.configure({ timeout: 60_000 });

  // ────────────────────────────────────────────────────────────────────────
  // 1. Colapso (desktop)
  // ────────────────────────────────────────────────────────────────────────
  test.describe('colapso — desktop', () => {
    test.use({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test.beforeEach(async ({ page }) => {
      await openMapa(page);
    });

    test('desktop arranca colapsado (rows escondidas) e expande por clique', async ({ page }) => {
      const hud = page.locator('[data-map-hud-collapsed]');
      await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');

      // Rows de filtro escondidas no estado inicial (Iniciante = row Nível).
      const levelRow = page.getByRole('group', { name: /Nível|Level/i });
      await expect(levelRow).toBeHidden();

      // O toggle de desktop é um icon button no canto do cabeçalho — localizar
      // por aria-label/aria-expanded (o label troca com o estado).
      const toggle = hud.getByRole('button', { name: /Mostrar filtros|Show filters/i });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await toggle.click();
      await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
      await expect(levelRow).toBeVisible();
      // O nome do botão troca com o estado («Ocultar filtros») — re-localizar.
      const toggleExpanded = hud.getByRole('button', { name: /Ocultar filtros|Hide filters/i });
      await expect(toggleExpanded).toHaveAttribute('aria-expanded', 'true');

      // Colapsar de volta esconde as rows outra vez.
      await toggleExpanded.click();
      await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');
      await expect(levelRow).toBeHidden();
    });

    test('HUD colapsado cobre < 18% da altura do mapa (orçamento)', async ({ page }) => {
      const m = await page.evaluate(() => {
        const hud = document.querySelector('[data-map-hud-collapsed]');
        const card = hud?.firstElementChild?.getBoundingClientRect();
        return { vh: window.innerHeight, top: card?.top ?? 0 };
      });
      const mapH = m.vh - 64; // fullscreen: 100dvh - header 4rem
      const coveredPct = ((m.vh - m.top) / mapH) * 100;
      // Cartão compacto = 1 linha (toggle no cabeçalho): ~13,4% no 1440x900;
      // folga para viewports curtos.
      expect(coveredPct).toBeLessThan(18);
    });

    test('HUD expandido mantém-se dentro do orçamento de 36%', async ({ page }) => {
      const hud = page.locator('[data-map-hud-collapsed]');
      await hud.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
      const m = await page.evaluate(() => {
        const hud = document.querySelector('[data-map-hud-collapsed]');
        const card = hud?.firstElementChild?.getBoundingClientRect();
        return { vh: window.innerHeight, top: card?.top ?? 0 };
      });
      const mapH = m.vh - 64;
      const coveredPct = ((m.vh - m.top) / mapH) * 100;
      // Sonda 2026-09-10: expandido 29,7% no 1440x900.
      expect(coveredPct).toBeLessThan(36);
    });

    test('legenda fica acima do HUD colapsado (sem colisão)', async ({ page }) => {
      // A legenda levanta via hudLift (ResizeObserver sobre o HUD).
      const m = await page.evaluate(() => {
        const legend = document.querySelector('[aria-label="Legenda do mapa"]');
        const hud = document.querySelector('[data-map-hud-collapsed]');
        const lb = legend?.getBoundingClientRect();
        const cb = hud?.firstElementChild?.getBoundingClientRect();
        return { legendBottom: lb?.bottom ?? 0, cardTop: cb?.top ?? 0 };
      });
      expect(m.legendBottom).toBeLessThanOrEqual(m.cardTop + 1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Alvos de toque (WCAG 2.5.8)
  // ────────────────────────────────────────────────────────────────────────
  test.describe('alvos de toque', () => {
    test.describe('mobile 390px', () => {
      test.use({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });

      test('rádios Mapa/Satélite do HUD ≥44px (o "Satélite" tinha 39px)', async ({ page }) => {
        await openMapa(page);

        const radios = page.getByRole('radiogroup', { name: 'Camadas' }).getByRole('radio');
        await expect(radios).toHaveCount(2);
        for (const radio of await radios.all()) {
          await expectMinTargetSize(radio, 'rádio do HUD');
        }
      });

      test('pills de modalidade ≥44px com filtros expandidos', async ({ page }) => {
        await openMapa(page);

        await expandMapHudFilters(page);
        const chips = page.getByRole('group', { name: 'Modalidade' }).getByRole('button');
        await expect(chips.first()).toBeVisible({ timeout: 10_000 });
        for (const chip of await chips.all()) {
          await expectMinTargetSize(chip, 'pill de modalidade');
        }
      });
    });

    test.describe('tablet 768px (touch — layout sm+)', () => {
      test.use({
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });

      test('pills ≥44px abaixo de lg', async ({ page }) => {
        await openMapa(page);

        // O HUD arranca colapsado em todas as superfícies (decisão 2026-09-10) —
        // expandir antes de medir as pills.
        await expandMapHudFilters(page);
        const chips = page.getByRole('group', { name: 'Modalidade' }).getByRole('button');
        await expect(chips.first()).toBeVisible({ timeout: 10_000 });
        for (const chip of await chips.all()) {
          await expectMinTargetSize(chip, 'pill de modalidade (tablet)');
        }
      });
    });

    test.describe('desktop — densidade por modalidade de input (V3′)', () => {
      test.use({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

      test('rato puro (any-pointer: fine): pills mantêm a densidade de 36px', async ({ page }) => {
        await openMapa(page);

        // O HUD arranca colapsado no desktop também (decisão 2026-09-10).
        await expandMapHudFilters(page);
        const surf = page.locator('[aria-label="Modalidade"] button').nth(1); // Surf
        await expect(surf).toBeVisible();

        const box = await surf.boundingBox();
        expect(box, 'chip de modalidade deveria ter caixa mensurável').not.toBeNull();
        // Densidade preservada no desktop de rato (decisão V3′ 2026-09): 36px.
        expect(box!.height, 'altura visual (rato)').toBeGreaterThanOrEqual(34);
        expect(box!.height, 'altura visual (rato)').toBeLessThanOrEqual(37);
      });

      test('toque em desktop (any-pointer: coarse): pills sobem ao piso de 44px', async ({ browser }) => {
        // Touch laptop / tablet em paisagem a renderizar o layout lg+: o
        // breakpoint de rato não se aplica — 44px garantidos (piso do projecto).
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
        const page = await ctx.newPage();
        await openMapa(page);

        // O HUD arranca colapsado no desktop também (decisão 2026-09-10).
        await expandMapHudFilters(page);
        const surf = page.locator('[aria-label="Modalidade"] button').nth(1); // Surf
        await expect(surf).toBeVisible();
        const box = await surf.boundingBox();
        expect(box, 'chip de modalidade deveria ter caixa mensurável').not.toBeNull();
        expect(box!.height, 'altura (toque em desktop)').toBeGreaterThanOrEqual(44);
        await ctx.close();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Overflow / scroll / hit-test
  // ────────────────────────────────────────────────────────────────────────
  test.describe('overflow, scroll e hit-test', () => {
    test.describe('mobile 360–390px', () => {
      test.use({
        viewport: { width: 360, height: 800 },
        hasTouch: true,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });

      test('linhas de pills rolam horizontalmente dentro do cartão', async ({ page }) => {
        await openMapa(page);
        await expandMapHudFilters(page);

        // 9 modalidades + 8 regiões em 360px não cabem: as linhas têm de ser
        // overflow-x-auto (roláveis) — nunca overflow-x-hidden (inacessível)
        // nem wrap infinito (cartão a crescer).
        const geo = await page.evaluate(() => {
          const region = document.querySelector('[aria-label="Modo explorar"]');
          const card = region?.querySelector('div');
          if (!card) return null;
          const cb = card.getBoundingClientRect();
          const strips = Array.from(card.querySelectorAll('[role="group"]')).map((g) => {
            const el = g as HTMLElement;
            return {
              label: el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? 'group',
              scrollable: el.scrollWidth > el.clientWidth,
              fits: el.scrollWidth <= el.clientWidth + 1,
            };
          });
          const cardRight = Math.round(cb.right);
          const stripsInside = Array.from(card.querySelectorAll('[role="group"]')).every(
            (g) => g.getBoundingClientRect().right <= cardRight + 1,
          );
          return { strips, stripsInside, cardRight };
        });
        expect(geo).not.toBeNull();
        // Pelo menos a linha de modalidades transborda → tem de ser rolável.
        const sportRow = geo!.strips.find((s) => /Modalidade|Sport/i.test(s.label));
        expect(sportRow, 'linha de modalidade presente').toBeDefined();
        expect(sportRow!.scrollable, 'linha de modalidade é rolável em 360px').toBe(true);
        // E nenhuma linha estoura o cartão (o scroll acontece DENTRO da linha).
        expect(geo!.stripsInside).toBe(true);
      });

      test('slider das horas não ultrapassa o cartão do HUD (regressão min-w-0)', async ({ page }) => {
        await openMapa(page, { query: '?hours=1' });
        const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
        await expect(slider).toBeVisible({ timeout: 15_000 });

        // Auditoria 2026-09-10: em 360px, a linha do time track (play + relógio +
        // chip da maré + slider) estourava o slider 7px para fora do cartão — o
        // flex-1 não encolhia abaixo do min-content do input. Fix: min-w-0.
        const geo = await page.evaluate(() => {
          const region = document.querySelector('[aria-label="Modo explorar"]');
          const card = region?.querySelector('div');
          const s = document.querySelector<HTMLElement>(
            '[data-map-hours-scrubber] input[type="range"]',
          );
          if (!card || !s) return null;
          const cb = card.getBoundingClientRect();
          const sb = s.getBoundingClientRect();
          return {
            sliderRight: Math.round(sb.right),
            cardRight: Math.round(cb.right),
            inside: sb.right <= cb.right + 1 && sb.left >= cb.left - 1,
          };
        });
        expect(geo).not.toBeNull();
        expect(geo!.inside).toBe(true);
        expect(geo!.sliderRight).toBeLessThanOrEqual(geo!.cardRight + 1);
      });
    });

    test.describe('mobile 390px — toggles de camadas', () => {
      test.use({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });

      for (const t of [
        { name: 'correntes', attr: 'data-map-currents-toggle', lsKey: 'ventu.map.currents', lsValue: '1' },
        { name: 'temperatura (SST)', attr: 'data-map-sst-toggle', lsKey: 'ventu.map.sst', lsValue: '1' },
        { name: 'isóbatas', attr: 'data-map-isobaths-toggle', lsKey: 'ventu.map.isobaths', lsValue: '1' },
        { name: 'radar IPMA', attr: 'data-map-radar-toggle', lsKey: 'ventu.radar.state', lsValue: null },
      ]) {
        test(`toggle «${t.name}» é o elemento de topo no strip e persiste após recarga`, async ({ page }) => {
          await openMapa(page, { radar: true, layers: true });
          await expandMapHudFilters(page);

          const toggle = page.locator(`[${t.attr}]`);
          await expect(toggle).toBeEnabled({ timeout: 15_000 });
          // O strip rola horizontalmente (overflow-x-auto) — um utilizador rola até
          // ao controlo; só depois é que tem de ser o elemento de topo.
          await toggle.scrollIntoViewIfNeeded();
          await expectTopmostHit(page, toggle);

          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-pressed', 'true');

          // A preferência tem de estar escrita em localStorage no momento do toggle.
          const stored = await page.evaluate((key) => localStorage.getItem(key), t.lsKey);
          if (t.lsValue === null) {
            expect(stored, `${t.lsKey} escrito`).toBeTruthy();
          } else {
            expect(stored, `${t.lsKey} = ${t.lsValue}`).toBe(t.lsValue);
          }

          // Recarga com o mesmo contexto (localStorage preservado) → estado reposto.
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
          await waitHydrated(page);
          await expandMapHudFilters(page);

          const after = page.locator(`[${t.attr}]`);
          await expect(after).toBeEnabled({ timeout: 15_000 });
          await expect(after).toHaveAttribute('aria-pressed', 'true');
        });
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Time track (scrub)
  // ────────────────────────────────────────────────────────────────────────
  test.describe('time track — scrub das 48h (desktop 1280px)', () => {
    // serviceWorkers: 'block' é OBRIGATÓRIO — o SW serve /data/* do cache e
    // contorna o page.route (causa histórica de flakes nesta suite).
    test.use({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test('deep link ?hours=1 liga o trilho; 08h→17h muda o score da Nazaré', async ({ page }) => {
      await openMapa(page, { query: '?hours=1' });

      await expect(page.locator('[data-map-hours="true"]')).toBeVisible();
      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      await expect(track).toContainText('08h');

      await expectNazareScore(page, '20');

      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await slider.fill('3');
      await expect(track).toContainText('17h');
      await expectNazareScore(page, '88');
    });

    test('deep link ?t=18 parte no passo mais próximo (17h)', async ({ page }) => {
      await openMapa(page, { query: '?hours=1&t=18' });

      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      await expect(track).toContainText('17h');
      await expectNazareScore(page, '88');
    });

    test('prefers-reduced-motion: não anima sozinho — o scrubber continua a mudar a hora', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openMapa(page, { query: '?hours=1' });

      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await slider.fill('0');
      await expect(track).toContainText('08h');
      await expect(page.locator('[data-map-hours-play]')).toBeVisible();
      await expectNazareScore(page, '20');

      await slider.fill('3');
      await expect(track).toContainText('17h');
      await expectNazareScore(page, '88');
    });
  });

  test.describe('time track — mobile 390px', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test('HUD no telemóvel: 08h→17h muda o mapa', async ({ page }) => {
      await openMapa(page, { query: '?hours=1' });

      await expect(page.locator('[data-map-hours-toggle]')).toBeVisible({ timeout: 15_000 });
      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      await expect(track).toContainText('08h');

      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await slider.fill('3');
      await expect(track).toContainText('17h');
    });
  });
});
