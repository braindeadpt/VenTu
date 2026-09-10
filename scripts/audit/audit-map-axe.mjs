/**
 * axe-core audit scoped to the map overlays (legend, HUD "Modo explorar",
 * controls, popup, sheet) on /pt/mapa/, in several interactive states and
 * both themes. Reports critical/serious/moderate violations per state.
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.AUDIT_BASE || 'http://localhost:58657';

const OVERLAY_INCLUDE = [
  '[aria-label="Legenda do mapa"], [aria-label="Map legend"]',
  '[aria-label="Modo explorar"], [aria-label="Explore mode"]',
  '[data-map-controls]',
  '.spot-popup',
  '[data-testid="map-spot-sheet"]',
  '[data-map-radar-scrubber], [data-map-hours-scrubber]',
  '[data-map-tide-chip], [data-map-thermal-chip]',
];

async function scan(page, label, extraWait = 0) {
  if (extraWait) await page.waitForTimeout(extraWait);
  const results = await new AxeBuilder({ page })
    .include(OVERLAY_INCLUDE.join(', '))
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const byImpact = { critical: [], serious: [], moderate: [], minor: [] };
  for (const v of results.violations) {
    const impact = v.impact || 'moderate';
    byImpact[impact] = byImpact[impact] || [];
    byImpact[impact].push(
      `${v.id} — ${v.help.split(':')[0].slice(0, 60)} (${v.nodes.length} nós)`,
    );
  }
  return {
    violations: Object.fromEntries(
      Object.entries(byImpact).filter(([, arr]) => arr.length),
    ),
    total: results.violations.length,
    pass: results.passes.length,
    incomplete: results.incomplete.map((i) => i.id).slice(0, 5),
  };
}

async function openMap(page, theme) {
  await page.addInitScript(() => {
    localStorage.setItem('ventu:windRingLegendSeen', '1');
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
  });
  await page.goto(BASE + '/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
  await page.waitForSelector('[aria-label="Modo explorar"]', { timeout: 30_000 });
  if (theme === 'ocean') {
    await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
for (const theme of ['dark', 'ocean']) {
  // ── Desktop: default + popup + layers ──
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const out = { theme, desktop: {} };
  await openMap(page, theme);
  out.desktop.default = await scan(page, 'default');
  out.desktop.default.sliderContrast = await page.evaluate(() => {
    const sliders = [...document.querySelectorAll('input[type="range"]')];
    return sliders.map((s) => {
      const cs = getComputedStyle(s);
      return { accent: cs.accentColor, bg: cs.backgroundColor };
    });
  });
  // popup
  await page.evaluate(() => {
    const markers = [...document.querySelectorAll('.leaflet-marker-icon.spot-marker')];
    for (const m of markers) {
      const r = m.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && (top === m || m.contains(top)) && r.top > 0 && r.bottom < innerHeight) {
        m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return;
      }
    }
  });
  await page.waitForTimeout(1200);
  out.desktop.popup = await scan(page, 'popup');
  // layers + legends (hours + isobaths + currents)
  await page.goto(BASE + '/pt/mapa/?hours=1&isobaths=1&currents=1', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
  await page.waitForSelector('[aria-label="Modo explorar"]', { timeout: 30_000 });
  if (theme === 'ocean') {
    await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2000);
  out.desktop.layers = await scan(page, 'layers');
  await ctx.close();

  // ── Mobile: collapsed + expanded ──
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mpage = await mctx.newPage();
  out.mobile = {};
  await openMap(mpage, theme);
  out.mobile.collapsed = await scan(mpage, 'collapsed');
  const expand = mpage.locator('[aria-label="Mostrar filtros"], [aria-label="Show filters"]').first();
  if (await expand.count()) {
    await expand.click().catch(() => {});
    await mpage.waitForTimeout(600);
  }
  out.mobile.expanded = await scan(mpage, 'expanded');
  // sheet
  await mpage.evaluate(() => {
    const markers = [...document.querySelectorAll('.leaflet-marker-icon.spot-marker')];
    for (const m of markers) {
      const r = m.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && (top === m || m.contains(top)) && r.top > 0 && r.bottom < innerHeight) {
        m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return;
      }
    }
  });
  await mpage.waitForTimeout(1200);
  out.mobile.sheet = await scan(mpage, 'sheet');
  await mctx.close();

  console.log('### theme=' + theme);
  console.log(JSON.stringify(out, null, 1));
}
await browser.close();