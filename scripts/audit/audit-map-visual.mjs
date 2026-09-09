/**
 * One-off visual audit probe (desktop + tablet + mobile) against the dev
 * server. Measures overlay geometry (controls/legend/HUD/zoom/attribution),
 * touch targets, and interactive states on /pt/mapa/. Read-only: captures no
 * screenshots, mutates nothing.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:49863';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false, isMobile: false },
  { name: 'laptop', width: 1024, height: 768, touch: false, isMobile: false },
  { name: 'tablet', width: 768, height: 1024, touch: true, isMobile: false },
  { name: 'mobile', width: 390, height: 844, touch: true, isMobile: true },
];

const GEO_SNIPPET = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const q = (s) => document.querySelector(s);
  const hit = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return 'zero-size';
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return !top || (!top.contains(el) && !el.contains(top)) ? 'covered-by:' + top.tagName + '.' + String(top.className).slice(0, 40) : 'ok';
  };
  const overlap = (a, b) => a && b && !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
  const issues = [];
  const geo = {
    leaflet: r(q('.leaflet-container')),
    zoom: r(q('.leaflet-control-zoom')),
    attribution: r(q('.leaflet-control-attribution')),
    controls: r(q('[data-map-controls]')),
    legend: r(q('[aria-label="Legenda do mapa"]')),
    hud: r(q('[aria-label="Modo explorar"]')),
    layerToggle: r(q('[role="radiogroup"][aria-label="Tipo de mapa"]')),
  };
  if (overlap(geo.controls, geo.zoom)) issues.push('controls overlap zoom');
  if (overlap(geo.legend, geo.hud)) issues.push('legend overlaps hud');
  if (overlap(geo.controls, geo.legend)) issues.push('controls overlap legend');
  if (overlap(geo.layerToggle, geo.controls)) issues.push('layerToggle overlaps controls');
  if (geo.layerToggle && geo.layerToggle.r > innerWidth) issues.push('layerToggle off-screen right');
  const small = [];
  document.querySelectorAll('[data-map-controls] button, [aria-label="Modo explorar"] button, [aria-label="Legenda do mapa"] button, [role="radiogroup"][aria-label="Tipo de mapa"] button, .leaflet-control-zoom a, .spot-popup .leaflet-popup-close-button').forEach(b => {
    const bb = b.getBoundingClientRect();
    if (bb.width > 0 && bb.height > 0 && (bb.width < 44 || bb.height < 44)) small.push({ label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30), w: Math.round(bb.width), h: Math.round(bb.height) });
  });
  if (small.length) issues.push({ smallTargets: small });
  const strips = [...document.querySelectorAll('[aria-label="Modo explorar"] [class*="overflow-x-auto"]')].map(el => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }));
  geo.attrHit = hit(q('.leaflet-control-attribution'));
  geo.mapTiles = q('.leaflet-container')?.getAttribute('data-map-tiles');
  return { geo, issues, strips, scrollY: scrollY, vw: innerWidth, vh: innerHeight };
})()`;

async function auditViewport(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.isMobile,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ventu:windRingLegendSeen', '1');
      localStorage.setItem('ventu.map.cluster', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  const out = { viewport: vp.name, issues: [], notes: [] };
  try {
    await page.goto(BASE + '/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
    await page.waitForSelector('[data-map-hud="visible"]', { timeout: 30_000 });
    // wait for tiles to settle (ok or failed) — cap at 20s
    await page
      .waitForFunction(() => {
        const el = document.querySelector('.leaflet-container');
        const s = el && el.getAttribute('data-map-tiles');
        return s === 'ok' || s === 'failed';
      }, { timeout: 20_000 })
      .catch(() => out.notes.push('tiles never settled'));
    await page.waitForTimeout(1200);

    const base = await page.evaluate(GEO_SNIPPET);
    out.base = base;
    out.issues.push(...base.issues);

    // ── Desktop: open a marker popup after zooming in ──
    if (vp.width >= 1024) {
      const zoomIn = page.locator('.leaflet-control-zoom a').first();
      for (let i = 0; i < 3; i++) await zoomIn.click().catch(() => {});
      await page.waitForTimeout(900);
      const marker = page.locator('.leaflet-marker-icon button[aria-label]').first();
      if (await marker.count()) {
        await marker.click().catch(() => {});
        await page.waitForTimeout(500);
        const popup = await page.evaluate(`(() => {
          const p = document.querySelector('.spot-popup');
          if (!p) return null;
          const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
          const cta = p.querySelector('.ventu-popup-detail');
          const cb = p.querySelector('.leaflet-popup-close-button');
          const hitTest = (el) => {
            const b = el.getBoundingClientRect();
            const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return !top || (!top.contains(el) && !el.contains(top)) ? 'covered-by:' + top.tagName + '.' + String(top.className).slice(0, 40) : 'ok';
          };
          return {
            popup: r(p),
            cta: cta ? { rect: r(cta), hit: hitTest(cta) } : null,
            close: cb ? { rect: r(cb), hit: hitTest(cb) } : null,
            withinViewport: p.getBoundingClientRect().right <= innerWidth && p.getBoundingClientRect().left >= 0,
          };
        })()`);
        out.popup = popup;
        if (!popup) out.notes.push('no popup opened');
      } else {
        out.notes.push('no unclustered marker found after zoom');
      }
      // legend content visible on desktop (sm:block)
      const legendContent = await page.evaluate(`(() => {
        const wrap = document.querySelector('[aria-label="Legenda do mapa"]');
        const bar = wrap && wrap.querySelector('.h-2');
        return { hasScoreBar: !!bar, barRect: bar ? JSON.stringify(bar.getBoundingClientRect()) : null };
      })()`);
      out.legendContent = legendContent;
    }

    // ── Mobile/tablet: expand HUD, check legend displacement; open sheet ──
    if (vp.width < 1024) {
      // expand HUD filters
      const expand = page.locator('[data-map-hud-collapsed] > div > button[aria-expanded]').first();
      if (await expand.count()) {
        await expand.click().catch(() => {});
        await page.waitForTimeout(400);
        const afterExpand = await page.evaluate(GEO_SNIPPET);
        out.afterExpand = afterExpand;
        out.issues.push(...afterExpand.issues.map((i) => 'expanded: ' + JSON.stringify(i)));
      }
      // collapse back
      const collapse = page.locator('[data-map-hud-collapsed] > div > button[aria-expanded]').first();
      if (await collapse.count()) await collapse.click().catch(() => {});
      await page.waitForTimeout(300);

      // open the bottom sheet via a marker tap
      const marker = page.locator('.leaflet-marker-icon button[aria-label]').first();
      if (await marker.count()) {
        await marker.click().catch(() => {});
        await page.waitForTimeout(600);
        const sheet = await page.evaluate(`(() => {
          const s = document.querySelector('[data-testid="map-spot-sheet"]');
          if (!s) return null;
          const b = s.getBoundingClientRect();
          const close = s.querySelector('button[aria-label="Fechar"], button[aria-label="Close"]');
          const cb = close ? close.getBoundingClientRect() : null;
          return { h: Math.round(b.height), withinViewport: b.right <= innerWidth, closeRect: cb ? { w: Math.round(cb.width), h: Math.round(cb.height) } : null };
        })()`);
        out.sheet = sheet;
        if (!sheet) out.notes.push('sheet did not open on marker tap');
      }
    }

    // ── Both: interact with the legend toggle (mobile) ──
    if (vp.width < 768) {
      const legendBtn = page.locator('[aria-label="Legenda do mapa"] button').first();
      const btnBox = await legendBtn.boundingBox().catch(() => null);
      if (btnBox && (btnBox.height < 44 || btnBox.width < 44)) {
        out.issues.push({ legendToggleTooSmall: { w: Math.round(btnBox.width), h: Math.round(btnBox.height) } });
      }
    }
  } catch (e) {
    out.issues.push('AUDIT ERROR: ' + String(e).slice(0, 200));
  } finally {
    await ctx.close();
  }
  return out;
}

const browser = await chromium.launch();
const results = [];
for (const vp of VIEWPORTS) {
  results.push(await auditViewport(browser, vp));
}
await browser.close();
console.log('=== AUDIT RESULTS ===');
for (const r of results) console.log(JSON.stringify(r, null, 1));
