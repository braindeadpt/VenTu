import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { interceptMapHours, interceptRadar, interceptIhBuoys, interceptWmoBuoys } from './helpers/conditions';
import { openMapLayersMenu, preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { expectTopmostHit } from './helpers/hit-test';
import { expandMapHudFilters } from './helpers/map-hud';

/**
 * Superfícies de exploração do /mapa — garantias consolidadas num único
 * ficheiro (substitui o spec do HUD «Modo Explorar»; a superfície mobile é
 * agora o bottom sheet de 3 estados e a desktop o painel lateral — mockup
 * aprovado, variante A).
 *
 * Secções:
 *  1. Painel desktop — nasce aberto, colapsa para o rail e volta; «Só a
 *     bombar» existe UMA vez (saiu da toolbar); legenda única.
 *  2. Alvos de toque (WCAG 2.5.8) — pills e toggles ≥44px nas duas
 *     superfícies; densidade 36px só em rato puro (decisão V3′).
 *  3. Overflow / scroll / hit-test — as linhas de pills rolam dentro do
 *     sheet em 360px (edge-fade, nunca clipping); os toggles de camadas são
 *     o elemento de topo no estado «half» e persistem entre recargas.
 *  4. Time track (scrub) — deep links ?hours/?t, scrub 08h→17h muda o score,
 *     mobile incluído (o trilho vive no «half» do sheet / no painel).
 *  5. Chip de estado da camada de boias — alvo ≥44px, aria-expanded,
 *     popover contido no viewport, Escape/clique-fora fecham e o
 *     «Ver no mapa» (estado stale) activa a camada.
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

/** IH sem key + WMO em baixo → chip de estado da camada de boias visível. */
const IH_NO_KEY = {
  fetchedAt: new Date().toISOString(),
  apiKeyConfigured: false,
  hasWaveData: false,
  stations: {},
};
const WMO_DOWN = { buoys: {}, hasWaveData: false, day: '20260815' };
/** IH com leitura antiga (>3h) + WMO antigo → estado stale («Ver no mapa»). */
const STALE_ISO = new Date(Date.now() - 12 * 3_600_000).toISOString();
const IH_STALE = {
  apiKeyConfigured: true,
  hasWaveData: true,
  stations: { 4: { status: 'active', latest: { date: STALE_ISO } } },
};
const WMO_STALE = {
  buoys: {
    6200084: { code: '6200084', name: 'Cabo Silleiro', latest: { date: STALE_ISO } },
  },
  hasWaveData: true,
  day: '20260815',
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
  opts: { query?: string; radar?: boolean; layers?: boolean; buoy?: 'noKey' | 'stale' } = {},
): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, opts.layers ? MAP_HOURS_STUB : MAP_HOURS_MINIMAL_STUB);
  if (opts.radar) await interceptRadar(page, RADAR_STUB);
  if (opts.buoy === 'noKey') {
    await interceptIhBuoys(page, IH_NO_KEY);
    await interceptWmoBuoys(page, WMO_DOWN);
  } else if (opts.buoy === 'stale') {
    await interceptIhBuoys(page, IH_STALE);
    await interceptWmoBuoys(page, WMO_STALE);
  }
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

test.describe('Explorar /mapa — garantias consolidadas (sheet mobile + painel desktop)', () => {
  test.describe.configure({ timeout: 60_000 });

  // ────────────────────────────────────────────────────────────────────────
  // 1. Painel desktop
  // ────────────────────────────────────────────────────────────────────────
  test.describe('painel desktop', () => {
    test.use({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test.beforeEach(async ({ page }) => {
      await openMapa(page);
    });

    test('nasce aberto com a lista, colapsa para o rail e volta', async ({ page }) => {
      const panel = page.locator('[data-map-panel="open"]');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('listbox')).toBeVisible();

      await panel.getByRole('button', { name: /Recolher painel|Collapse panel/i }).click();
      const rail = page.locator('[data-map-panel="rail"]');
      await expect(rail).toBeVisible();
      await expect(panel).toHaveCount(0);

      await rail.getByRole('button', { name: /Abrir lista|Open spots list/i }).click();
      await expect(panel).toBeVisible();
    });

    test('«Só a bombar» existe uma única vez — no painel, não na toolbar', async ({ page }) => {
      const toggles = page.locator('[data-map-only-on-toggle]');
      await expect(toggles).toHaveCount(1);
      await expect(page.locator('[data-map-controls] [data-map-only-on-toggle]')).toHaveCount(0);
      await expect(
        page.locator('[data-map-panel] [data-map-only-on-toggle]'),
      ).toBeVisible();
    });

    test('uma só legenda de score no fullscreen desktop', async ({ page }) => {
      await expect(page.getByRole('region', { name: /Legenda do mapa|Map legend/i })).toHaveCount(1);
    });

    test('o painel não colide com a legenda (cantos opostos)', async ({ page }) => {
      const geo = await page.evaluate(() => {
        const panel = document.querySelector('[data-map-panel="open"]')?.getBoundingClientRect();
        const legend = document
          .querySelector('[aria-label="Legenda do mapa"]')
          ?.getBoundingClientRect();
        if (!panel || !legend) return null;
        return {
          disjoint:
            panel.right <= legend.left ||
            legend.right <= panel.left ||
            panel.bottom <= legend.top ||
            legend.bottom <= panel.top,
        };
      });
      expect(geo?.disjoint).toBe(true);
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

      test('toggles do sheet (camadas e «Ver também») ≥44px', async ({ page }) => {
        await openMapa(page, { layers: true });
        await expandMapHudFilters(page); // sheet → half

        const layers = page.getByRole('group', { name: /Camadas|Layers/i }).getByRole('button');
        for (const btn of await layers.all()) {
          await expectMinTargetSize(btn, 'toggle de camada do sheet');
        }
        const extras = page.getByRole('group', { name: /Ver também|See also/i }).getByRole('button');
        for (const btn of await extras.all()) {
          await expectMinTargetSize(btn, 'toggle «Ver também» do sheet');
        }
      });

      test('pills de modalidade ≥44px no estado half', async ({ page }) => {
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

      test('pills do painel ≥44px', async ({ page }) => {
        await openMapa(page);
        const chips = page
          .locator('[data-map-panel]')
          .getByRole('group', { name: 'Modalidade' })
          .getByRole('button');
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
        const surf = page.locator('[data-map-panel] [aria-label="Modalidade"] button').nth(1); // Surf
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

        const surf = page.locator('[data-map-panel] [aria-label="Modalidade"] button').nth(1); // Surf
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

      test('linhas de pills rolam horizontalmente dentro do sheet', async ({ page }) => {
        await openMapa(page);
        await expandMapHudFilters(page);

        // 9 modalidades + 8 regiões em 360px não cabem: as linhas têm de ser
        // overflow-x-auto (roláveis com edge-fade) — nunca overflow-x-hidden
        // (inacessível) nem wrap infinito (sheet a crescer).
        const geo = await page.evaluate(() => {
          const region = document.querySelector('[aria-label="Modo explorar"]');
          const card = region?.querySelector('[data-sheet-half]');
          if (!card) return null;
          const cb = card.getBoundingClientRect();
          const strips = Array.from(card.querySelectorAll('[role="group"]')).map((g) => {
            const el = g as HTMLElement;
            return {
              label: el.getAttribute('aria-label') ?? 'group',
              scrollable: el.scrollWidth > el.clientWidth,
            };
          });
          const cardRight = Math.round(cb.right);
          const stripsInside = Array.from(card.querySelectorAll('[role="group"]')).every(
            (g) => g.getBoundingClientRect().right <= cardRight + 1,
          );
          return { strips, stripsInside };
        });
        expect(geo).not.toBeNull();
        // Pelo menos a linha de modalidades transborda → tem de ser rolável.
        const sportRow = geo!.strips.find((s) => /Modalidade|Sport/i.test(s.label));
        expect(sportRow, 'linha de modalidade presente').toBeDefined();
        expect(sportRow!.scrollable, 'linha de modalidade é rolável em 360px').toBe(true);
        // E nenhuma linha estoura o cartão (o scroll acontece DENTRO da linha).
        expect(geo!.stripsInside).toBe(true);
      });

      test('slider das horas não ultrapassa o sheet (regressão min-w-0)', async ({ page }) => {
        await openMapa(page, { query: '?hours=1' });
        const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
        await expect(slider).toBeVisible({ timeout: 15_000 });

        const geo = await page.evaluate(() => {
          const card = document.querySelector('[data-sheet-half]');
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

      // As camadas vivem inline no estado «half» do sheet — sem menu.
      for (const t of [
        { name: 'correntes', attr: 'data-map-currents-toggle', lsKey: 'ventu.map.currents', lsValue: '1' },
        { name: 'temperatura (SST)', attr: 'data-map-sst-toggle', lsKey: 'ventu.map.sst', lsValue: '1' },
        { name: 'isóbatas', attr: 'data-map-isobaths-toggle', lsKey: 'ventu.map.isobaths', lsValue: '1' },
        { name: 'radar IPMA', attr: 'data-map-radar-toggle', lsKey: 'ventu.radar.state', lsValue: null },
      ]) {
        test(`toggle «${t.name}» é o elemento de topo no sheet e persiste após recarga`, async ({ page }) => {
          await openMapa(page, { radar: true, layers: true });
          await expandMapHudFilters(page); // sheet → half

          const toggle = page.locator(`[${t.attr}]`);
          await expect(toggle).toBeEnabled({ timeout: 15_000 });
          // As linhas rolam — um utilizador rola até ao controlo; só depois é
          // que tem de ser o elemento de topo.
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
      // UX v3 §3 — a pill mostra «Agora · HH:MM» ao vivo e o cabeçalho do
      // scrubber «agora»/«qui 17:00» (formato da maquete, não «17h»).
      await expect(page.locator('[data-map-time-pill]')).toContainText('08:00');

      await expectNazareScore(page, '20');

      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await slider.fill('3');
      await expect(track).toContainText('17:00');
      await expectNazareScore(page, '88');
    });

    test('deep link ?t=18 parte no passo mais próximo (17h)', async ({ page }) => {
      await openMapa(page, { query: '?hours=1&t=18' });

      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      await expect(track).toContainText('17:00');
      await expectNazareScore(page, '88');
    });

    test('prefers-reduced-motion: não anima sozinho — o scrubber continua a mudar a hora', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openMapa(page, { query: '?hours=1' });

      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await slider.fill('0');
      await expect(page.locator('[data-map-time-pill]')).toContainText('08:00');
      await expect(page.locator('[data-map-hours-play]')).toBeVisible();
      await expectNazareScore(page, '20');

      await slider.fill('3');
      await expect(track).toContainText('17:00');
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

    test('sheet no telemóvel: ?hours=1 abre no estado half e 08h→17h muda o mapa', async ({ page }) => {
      await openMapa(page, { query: '?hours=1' });

      // O deep link abre o sheet no estado «half» — onde vive o trilho.
      await expect(page.locator('[data-explore-sheet]')).toHaveAttribute(
        'data-explore-sheet',
        'half',
        { timeout: 15_000 },
      );
      await expect(page.locator('[data-map-hours-toggle]')).toBeVisible({ timeout: 15_000 });
      const track = page.locator('[data-map-time-track-mode="hours"]');
      await expect(track).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-map-time-pill]')).toContainText('08:00');

      const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await slider.fill('3');
      await expect(track).toContainText('17:00');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Chip de estado da camada de boias
  // ────────────────────────────────────────────────────────────────────────
  test.describe('chip de estado da camada de boias', () => {
    // O chip vive no painel (desktop) e no peek/half do sheet (mobile); sem
    // key IH a camada nasce em aviso.
    test.use({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    test('alvo ≥44px, aria-expanded sincronizado e popover contido', async ({ page }) => {
      await openMapa(page, { buoy: 'noKey' });

      const chip = page.locator('[data-buoy-layer-chip="true"]');
      await expect(chip).toBeVisible({ timeout: 20_000 });
      const box = await chip.boundingBox();
      expect(box, 'chip deveria ter caixa mensurável').not.toBeNull();
      expect(box!.width, 'largura do chip').toBeGreaterThanOrEqual(44);
      expect(box!.height, 'altura do chip').toBeGreaterThanOrEqual(44);
      await expect(chip).toHaveAttribute('aria-expanded', 'false');

      await chip.click();
      const pop = page.locator('[data-buoy-chip-popover="true"]');
      await expect(pop).toBeVisible({ timeout: 5_000 });
      await expect(chip).toHaveAttribute('aria-expanded', 'true');

      // Contido no viewport (o popover é left-0 no chip — guard min(320px, 100vw-2rem)).
      const geo = await page.evaluate(() => {
        const r = document
          .querySelector('[data-buoy-chip-popover="true"]')!
          .getBoundingClientRect();
        return { left: r.left, right: r.right, vw: innerWidth };
      });
      expect(geo.left).toBeGreaterThanOrEqual(0);
      expect(geo.right).toBeLessThanOrEqual(geo.vw);

      // Escape fecha.
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
    });

    test('clique fora fecha e «Ver no mapa» (stale) activa a camada de boias', async ({ page }) => {
      await openMapa(page, { buoy: 'stale' });

      const chip = page.locator('[data-buoy-layer-chip="true"]');
      await expect(chip).toBeVisible({ timeout: 20_000 });
      await chip.click();
      const pop = page.locator('[data-buoy-chip-popover="true"]');
      await expect(pop).toBeVisible({ timeout: 5_000 });

      // Clique fora (no mapa, longe do popover) fecha.
      await page.mouse.click(700, 300);
      await expect(pop).toHaveCount(0);

      // Estado stale: abrir de novo e usar «Ver no mapa» → camada ligada +
      // preferência persistida.
      await chip.click();
      await expect(pop).toBeVisible({ timeout: 5_000 });
      await pop.getByRole('button', { name: 'Ver no mapa' }).click();
      await expect(pop).toHaveCount(0);
      expect(
        await page.evaluate(() => localStorage.getItem('ventu.map.buoys')),
      ).toBe('1');
    });
  });
});
