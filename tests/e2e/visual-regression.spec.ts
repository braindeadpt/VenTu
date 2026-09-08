import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { forceLiveSpotMode } from './helpers/conditions';

// The site's service worker (public/sw.js) serves /data/* from its own cache
// and BYPASSES page.route — late spot-page fetches (the hydration cascade)
// would silently get the BUILD's data instead of the fixture, reintroducing
// drift exactly where the fixture is supposed to pin. Same documented trap as
// tests/e2e/helpers/conditions.ts; blocking the SW routes every /data/
// request through the fixture.
test.use({ serviceWorkers: 'block' });

/**
 * Visual regression — golden-baseline pixel diffing (toHaveScreenshot).
 *
 * Contract:
 *  - `npm run test:visual` gates every commit against committed PNG baselines
 *    (zero-diff default; a pixel shift, clipped card or contrast change fails
 *    with an exact diff image).
 *  - `npm run test:visual:update` re-records baselines after a DELIBERATE
 *    visual change — review the diff before committing the new PNGs.
 *  - Baselines are platform-bound (font AA differs per OS): record them on
 *    Linux (CI's runner) for the CI gate; locally, run :update once first.
 *
 * Hermeticity rules baked in (learned the hard way — see the audit history):
 *  - reducedMotion forced via page.emulateMedia: the runner-level
 *    `test.use({ reducedMotion })` emulation is silently NOT applied on some
 *    platforms (Windows), and the 48h/radar tracks autoplay without it.
 *  - The map waits for painted tiles, then a settle beat — tiles fade in
 *    over ~300ms; snapshotting mid-fade produces phantom diffs.
 *  - A full-page scroll sweep forces loading="lazy" images to fetch BEFORE
 *    capture (fullPage screenshots do not scroll, so lazy images below the
 *    fold would otherwise be missing → guaranteed diff).
 *  - animations: 'disabled' + a global freeze style make pixels deterministic
 *    without changing layout.
 *
 * Data drift: the data pipeline commits ~15×/day and rebuilds the export, so
 * data-derived content (scores, wave heights, dates, counts, buoy clocks, AND
 * structure such as list heights) differs between the baseline run and the
 * gate run even though no code changed — a raw pixel gate would fail on data
 * churn, not regressions.
 *
 * The FIXTURE, not the build, drives every capture: gotoStable sets the
 * ventu_live=1 cookie (the same seam the hermetic specs use — see
 * tests/e2e/helpers/conditions.ts) so baked pages take their client-fetch
 * path, and serves every /data/** request from the COMMITTED fixture at
 * tests/e2e/fixtures/data (a snapshot of out/data, refreshed deliberately
 * via scripts/sync-visual-fixture.mjs when the data SHAPE changes — a new
 * spot, a new data file). The build's own data is never rendered, so a data
 * commit can move zero pixels: captures measure LAYOUT against the fixture,
 * not CONTENT against the day's data.
 *
 * Masks stay as a second belt (same spirit as the live-canvas rule):
 * data-derived text leaves are marked data-visual-dynamic and masked; zones
 * whose content is 100%% data output (forecast table body, charts, radar,
 * warning lists, month strip) are masked as units. A layout regression
 * (clipped card, missing section, broken spacing) still moves pixels OUTSIDE
 * the masks and fails.
 */

/**
 * Set the light theme BEFORE navigation: the app switches theme via a
 * pre-paint script reading localStorage('windspot:theme'), so colorScheme
 * emulation alone never produces the light theme (dark is the default).
 * Baselines must match the real user path — a click on the theme toggle.
 */
async function setTheme(page: Page, theme: 'dark' | 'ocean'): Promise<void> {
  await page.addInitScript((t) => {
    try {
      if (t === 'ocean') localStorage.setItem('windspot:theme', 'light');
      else localStorage.removeItem('windspot:theme');
    } catch {
      /* storage disabled */
    }
  }, theme);
}

const CORE_ROUTES = [
  { path: '/pt/', name: 'home' },
  { path: '/pt/mapa/', name: 'mapa' },
  { path: '/pt/spots/', name: 'spots' },
  { path: '/pt/spots/nazare/', name: 'spot-nazare' },
  { path: '/pt/news/', name: 'news' },
  { path: '/pt/diretorio/', name: 'diretorio' },
  { path: '/pt/ferramentas/calculadora-fato/', name: 'calc-fato' },
  { path: '/pt/ferramentas/calculadora-kite/', name: 'calc-kite' },
  { path: '/pt/sazonalidade/', name: 'sazonalidade' },
  { path: '/pt/fontes/', name: 'fontes' },
] as const;

/**
 * Smoke tier: representative surfaces from the REST of the sitemap (other
 * locales, explore SEO landings, school directory entries, news article,
 * modalidade page). One viewport (mobile 390px), dark theme only, 5%% pixel
 * tolerance + 30s timeout — a broken layout, overlapping text or missing
 * content still fails loudly, but AA jitter and tile timing don't gate.
 * (10 core routes × 2 themes × 2 viewports = 40 goldens + ~20 smoke = 60.)
 */
const SMOKE_ROUTES = [
  { path: '/en/', name: 'smoke-home-en' },
  { path: '/es/', name: 'smoke-home-es' },
  { path: '/de/', name: 'smoke-home-de' },
  { path: '/fr/', name: 'smoke-home-fr' },
  { path: '/en/mapa/', name: 'smoke-mapa-en' },
  { path: '/en/spots/nazare/', name: 'smoke-spot-en' },
  { path: '/es/explorar/', name: 'smoke-explorar-es' },
  { path: '/pt/explorar/surf-lisboa/', name: 'smoke-explorar-surf-lisboa' },
  { path: '/de/explorar/kitesurf/', name: 'smoke-explorar-kitesurf-de' },
  { path: '/fr/modalidades/surf/', name: 'smoke-modalidade-fr' },
  { path: '/pt/modalidades/kitesurf/', name: 'smoke-modalidade-kitesurf' },
  { path: '/pt/diretorio/3-surfers/', name: 'smoke-school' },
  { path: '/pt/news/', name: 'smoke-news-detail-index' },
  { path: '/en/alerts/', name: 'smoke-alerts-en' },
  { path: '/es/about/', name: 'smoke-about-es' },
  { path: '/de/fontes/', name: 'smoke-fontes-de' },
  { path: '/fr/ferramentas/', name: 'smoke-ferramentas-fr' },
  { path: '/pt/livecams/', name: 'smoke-livecams' },
  { path: '/pt/compare/', name: 'smoke-compare' },
  { path: '/pt/passaporte/', name: 'smoke-passaporte' },
] as const;

/**
 * Routes whose capture contains a live Leaflet map (home hero map, /mapa,
 * /spots and spot pages' hero mini-map, DirectoryMap) and/or continuously
 * re-rendering time-windowed charts. Tiles arrive at slightly different
 * times per run, marker scores redraw, and zero-diff stability can never
 * settle — these get a 2% pixel tolerance + longer snapshot timeout; every
 * other page is gated at ZERO diff (the toHaveScreenshot default).
 */
const MAP_ROUTES = new Set([
  'home',
  'mapa',
  'spots',
  'diretorio',
  'spot-nazare',
  // Smoke tier: any surface embedding a live map or heavy live-data feed.
  'smoke-mapa-en',
  'smoke-spot-en',
  'smoke-home-en',
  'smoke-home-es',
  'smoke-home-de',
  'smoke-home-fr',
  'smoke-explorar-es',
  'smoke-explorar-surf-lisboa',
  'smoke-explorar-kitesurf-de',
  'smoke-modalidade-fr',
  'smoke-modalidade-kitesurf',
  'smoke-livecams',
]);

/**
 * The ONLY route that gates the live map canvas itself: /mapa is a fixed
 * fullscreen map whose settle wait + 2% tolerance proved stable. Every other
 * map-bearing surface (hero embeds, spot mini-maps, directory map) embeds the
 * same component as a live canvas whose marker/tile timing flips between runs
 * (~9% of a full-page capture, migrating between routes run to run). Those
 * mask the canvas (visibility:hidden — the container box keeps gating the
 * layout around it) instead of pretending a live canvas is deterministic.
 */
const MAP_CANVAS_ROUTE = 'mapa';

/**
 * Fixed observation payload for the OBS-worker fetch ({WORKER}/obs?lat&lon —
 * live weather-station data served from OUTSIDE /data/**, so the build-snapshot
 * intercept misses it). observedAt is FIXED_NOW − 5min: perpetually fresh
 * (isObservedFresh gates the band) and identical across runs.
 */
/** Frozen client clock: tide/observed charts render time-windowed curves
 * ("last 48h ending now" + a now-cursor), so their pixels drift between runs
 * unless Date.now() is pinned. Playwright's clock API fixes every client-side
 * read; the baked HTML used real build time but charts re-render client-side
 * against this instant, deterministically.
 */
const FIXED_NOW = new Date('2026-09-03T12:00:00Z').getTime();

/**
 * Deterministic 1×1 tile PNG (transparent) for external basemap hosts.
 * Without this, live tile servers decide whether the hero map paints —
 * under parallel load the Carto stall timer (CARTO_TILE_FALLBACK_MS) fires,
 * the basemap flips to fallback/failed and the "map unavailable" overlay
 * shows in some runs but not others (a whole-hero diff, unreproducible).
 * Serving every tile request locally makes tileState deterministically 'ok'
 * while keeping the full Leaflet layout (markers, controls, HUD) intact.
 * 1px source scaled by Leaflet keeps grey basemap fill with zero network.
 */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** External hosts whose responses would otherwise decide pixel output. */
const EXTERNAL_TILE_ROUTES: Array<{ pattern: string; body: Buffer | string }> = [
  { pattern: '**://server.arcgisonline.com/**', body: TILE_PNG },
  { pattern: '**://*.basemaps.cartocdn.com/**', body: TILE_PNG },
  // Livecams embed a YouTube iframe: its poster/thumbnail never loads the
  // same way twice — freeze it (the iframe frame itself still renders).
  { pattern: '**://i.ytimg.com/**', body: TILE_PNG },
  { pattern: '**://img.youtube.com/**', body: TILE_PNG },
];

const FAKE_OBS = {
  observed: {
    windSpeedKt: 12.4,
    windDirDeg: 315,
    windCardinal: 'NW',
    tempC: 17.2,
    stationName: 'Fixture Station',
    distanceKm: 3.2,
    observedAt: new Date(FIXED_NOW - 5 * 60_000).toISOString(),
    source: 'ipma',
  },
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const THEMES = ['dark', 'ocean'] as const;

// Full-page captures + map settle + data sweeps run past the 30s default.
test.describe.configure({ timeout: 120_000 });

/** Force loading="lazy" images to fetch, then restore scroll position. */
async function sweepLazyImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const max = document.body.scrollHeight;
    for (let y = 0; y <= max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await Promise.all(
      Array.from(document.querySelectorAll('img'), (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.addEventListener('load', r, { once: true });
              img.addEventListener('error', r, { once: true });
            }),
      ),
    );
  });
}

/**
 * Rewrite time-relative strings ("Há 45 min", "Actualizado 14:32") to fixed
 * values. Ages recompute client-side from Date.now() and drift between the
 * baseline run and the gating run — pure clock noise, not layout. Normalizing
 * keeps the zero-diff gate honest: a real visual regression still fails.
 */
async function normalizeVolatileText(page: Page): Promise<void> {
  await page.evaluate(() => {
    const RE = /(?:(Há|ha)\s+\d+\s*(?:min|h|d)|(?:\d+m|\d+h|\d+d)\s+ago|Actualizado[^\n]{0,24}|Updated[^\n]{0,24})/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const next = node.textContent?.replace(RE, (m) =>
        m.startsWith('Actualizado') || m.startsWith('Updated')
          ? m.replace(/\d{1,2}:\d{2}/, '12:00').replace(/\d+\s+min/, '5 min')
          : m.replace(/\d+/, '3'),
      );
      if (next && next !== node.textContent) node.textContent = next;
    }
    // <time> elements: React re-renders client-relative ages AFTER the text
    // pass above, reverting normalization. Fix at the semantic level — every
    // <time> with digits gets fixed display text (dateTime attr preserved).
    for (const t of document.querySelectorAll('time')) {
      const txt = t.textContent ?? '';
      if (/\d/.test(txt)) t.textContent = txt.replace(/\d{1,2}:\d{2}/, '12:00').replace(/\d+/, '3');
    }
  });
}

/**
 * Mask selectors for data-derived content. Everything matched is painted over
 * in the comparison (see the data-drift policy in the header). Stable selectors
 * only: component-authored data-visual-dynamic attributes plus pre-existing
 * semantic hooks (wave clock, coastal chart/refs, buoy streak) — never Tailwind
 * utility classes, which change with styling.
 */
const DATA_MASK_SELECTORS = [
  '[data-visual-dynamic]',
  '[data-wave-clock="true"]',
  '[data-daily-active-chart]',
  '[data-coastal-ref]',
  '[data-buoy-streak="true"]',
  // Moon-tide strip (sazonalidade): the today-ring (ring-2) protrudes 2px
  // above the masked day grid and lands on a different tile run-to-run as
  // the flex wrap shifts by a pixel — mask the whole section so the month
  // data never gates (the strip's height/layout is month-driven by design).
  '[data-moon-tide-strip]',
];

/** Resolve the data-drift masks against the current page. */
async function collectDataMasks(page: Page): Promise<Locator[]> {
  return DATA_MASK_SELECTORS.map((sel) => page.locator(sel));
}

/** Wait until the basemap has actually painted tiles (not mid-fade). */
async function waitForMapSettled(page: Page): Promise<void> {
  const map = page.locator('.leaflet-container');
  await map.waitFor({ state: 'visible', timeout: 30_000 });
  // Tiles fade in (~200ms transition): require at least one painted tile,
  // then wait out the fade so the snapshot is past the transition.
  await page
    .waitForFunction(() => document.querySelectorAll('.leaflet-tile').length > 0, null, {
      timeout: 30_000,
    })
    .catch(() => {
      /* tile providers can be blocked in CI — the layout still renders */
    });
  await page.waitForTimeout(1200);
}

async function gotoStable(page: Page, path: string, isMap = false): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The hermetic-spec seam: forces baked spot/listing pages onto their
  // client-fetch path so the route below (which serves the committed FIXTURE,
  // not the build's data) actually drives the render. Inert on routes that
  // fetch unconditionally (maps, home grid) and in production (nobody sets
  // the cookie) — the bake stays the default.
  await forceLiveSpotMode(page);
  // Pin client time BEFORE navigation (see FIXED_NOW above).
  await page.clock.install({ time: FIXED_NOW });
  // Freeze ALL client-fetched live data from the COMMITTED fixture
  // (tests/e2e/fixtures/data — a snapshot of out/data) so captures render
  // the same layout on every run and every build, regardless of what the
  // pipeline committed today. Fixture-first, build-snapshot fallback: files
  // added to the data set after the last deliberate fixture sync still get
  // served deterministically per-build (documented gap; sync the fixture
  // deliberately when a NEW data file becomes layout-relevant).
  const fixtureDir = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'data');
  const buildDir = join(process.cwd(), 'out', 'data');
  await page.route('**/data/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const rel = pathname.replace(/^\/data\//, '');
    const fixtureFile = join(fixtureDir, rel);
    if (existsSync(fixtureFile)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: readFileSync(fixtureFile, 'utf-8'),
      });
      return;
    }
    const buildFile = join(buildDir, rel);
    if (existsSync(buildFile)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: readFileSync(buildFile, 'utf-8'),
      });
      return;
    }
    await route.continue();
  });
  // Freeze the live OBS-worker observation (outside /data/**).
  await page.route('**/obs?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_OBS) });
  });
  // Freeze external tile hosts: deterministic basemap, no stall-fallback races.
  for (const { pattern, body } of EXTERNAL_TILE_ROUTES) {
    await page.route(pattern, async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body });
    });
  }
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        caret-color: transparent !important;
      }
    `,
  });
  if (isMap) {
    // All map-bearing surfaces (hero embeds, /mapa fullscreen, spot mini-maps):
    // wait for painted tiles + fade so the snapshot isn't mid-transition.
    try {
      await waitForMapSettled(page);
    } catch {
      /* a smoke surface without a container still gets its layout gated */
    }
  }
  await sweepLazyImages(page);
  await normalizeVolatileText(page);
  // Live-mode pages mount empty and fill from the fetched fixture — the CLS
  // the bake eliminated is back on the fetch path. Capture only after the
  // layout STOPPED growing (two equal height samples, 250 ms apart — the
  // scrollToSettledBottom pattern from observed-wave-card.spec.ts), so the
  // gate measures layout, not fetch timing.
  await page
    .waitForFunction(
      () => {
        const first = document.body.scrollHeight;
        return new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(document.body.scrollHeight === first), 250);
        });
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {
      /* a page that never stops growing (live charts) is already gated by the
         map/canvas tolerances — never fail the settle itself */
    });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
}

for (const viewport of Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>) {
  for (const theme of THEMES) {
    test.describe(`visual: ${viewport} · ${theme}`, () => {
      test.use({
        viewport: VIEWPORTS[viewport],
        ...(viewport === 'mobile' ? { hasTouch: true } : {}),
        colorScheme: theme === 'dark' ? 'dark' : 'light',
      });

      for (const route of CORE_ROUTES) {
        test(`${route.name} matches baseline`, async ({ page }) => {
          await preseedWindRingLegend(page);
          await setTheme(page, theme);
          const isMap = MAP_ROUTES.has(route.name);
          await gotoStable(page, route.path, isMap);
          if (isMap && route.name !== MAP_CANVAS_ROUTE) {
            await page.addStyleTag({ content: '.leaflet-container{visibility:hidden!important}' });
          }
          await expect(page).toHaveScreenshot(`${route.name}--${viewport}--${theme}.png`, {
            // /mapa é fixed fullscreen (100dvh, sem scroll): fullPage é
            // instável aí (a altura variou entre runs) e desnecessário.
            fullPage: route.name !== 'mapa',
            animations: 'disabled',
            caret: 'hide',
            mask: await collectDataMasks(page),
            ...(isMap
              ? { maxDiffPixelRatio: 0.02, timeout: 30_000 }
              // Zero-diff except a 64px allowance: sub-pixel font AA specks on
              // text-heavy pages produce ≤ dozens of stray px between runs; any
              // real layout/contrast change shifts hundreds+ and still fails.
              : { maxDiffPixels: 64, timeout: 10_000 }),
          });
        });
      }
    });
  }
}

/**
 * Smoke tier — the rest of the sitemap, one viewport/theme. Same hermetic
 * setup as the core tier; looser (5%) tolerance since these routes ship
 * with one gate for all locales and their copy varies in length.
 */
test.describe('visual: smoke (rest of sitemap)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({
    viewport: VIEWPORTS.mobile,
    hasTouch: true,
    colorScheme: 'dark',
  });

  for (const route of SMOKE_ROUTES) {
    test(`${route.name} matches baseline`, async ({ page }) => {
      await preseedWindRingLegend(page);
      await setTheme(page, 'dark');
      // Smoke tier: no map settle wait — the live Leaflet canvas is masked
      // below instead (see MAP_CANVAS_ROUTE). The core tier already gates the
      // /mapa canvas strictly.
      await gotoStable(page, route.path, false);
      if (MAP_ROUTES.has(route.name)) {
        await page.addStyleTag({ content: '.leaflet-container{visibility:hidden!important}' });
      }
      await expect(page).toHaveScreenshot(`${route.name}--mobile--dark.png`, {
        fullPage: route.name !== 'smoke-mapa-en',
        animations: 'disabled',
        caret: 'hide',
        mask: await collectDataMasks(page),
        ...(MAP_ROUTES.has(route.name)
          ? { maxDiffPixelRatio: 0.05, timeout: 30_000 }
          : { maxDiffPixelRatio: 0.05, timeout: 10_000 }),
      });
    });
  }
});
