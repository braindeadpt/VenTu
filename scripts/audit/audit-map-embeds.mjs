/**
 * One-off audit of the map EMBEDS (spots grid + homepage hero) at mobile and
 * desktop sizes: overlay collisions (controls/zoom/layer toggle) and touch
 * targets inside the constrained embed box. Read-only.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:49863';

const TARGETS = [
  { name: 'spots-embed', path: '/pt/spots/' },
  { name: 'home-hero', path: '/pt/' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false, isMobile: false },
  { name: 'mobile', width: 390, height: 844, touch: true, isMobile: true },
];

const SNIPPET = (embedSel) => `(() => {
  const embed = document.querySelector('${embedSel}');
  if (!embed) return { missing: true };
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const overlap = (a, b) => a && b && !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
  const issues = [];
  const geo = {
    embedBox: r(embed),
    leaflet: r(embed.querySelector('.leaflet-container')),
    zoom: r(embed.querySelector('.leaflet-control-zoom')),
    attribution: r(embed.querySelector('.leaflet-control-attribution')),
    controls: r(embed.querySelector('[data-map-controls]')),
    legend: r(embed.querySelector('[aria-label="Legenda do mapa"]')),
    layerToggle: r(embed.querySelector('[role="radiogroup"][aria-label="Tipo de mapa"]')),
    heroRadarBtn: r([...embed.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').match(/radar|Radar/i))),
    heroIsobathsBtn: r([...embed.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').match(/sóbata|sobate|isobath/i))),
  };
  if (overlap(geo.controls, geo.zoom)) issues.push('controls overlap zoom');
  if (overlap(geo.controls, geo.layerToggle)) issues.push('controls overlap layerToggle');
  if (overlap(geo.layerToggle, geo.legend)) issues.push('layerToggle overlaps legend');
  if (overlap(geo.heroRadarBtn, geo.heroIsobathsBtn)) issues.push('hero radar overlaps isobaths btn');
  if (geo.layerToggle && geo.layerToggle.b > geo.embedBox.b) issues.push('layerToggle spills below embed');
  if (geo.controls && geo.controls.b > geo.embedBox.b) issues.push('controls spill below embed');
  const small = [];
  embed.querySelectorAll('button, .leaflet-control-zoom a, [role="radio"]').forEach(b => {
    const bb = b.getBoundingClientRect();
    if (bb.width > 0 && bb.height > 0 && (bb.width < 44 || bb.height < 44)) small.push({ label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 28), w: Math.round(bb.width), h: Math.round(bb.height) });
  });
  if (small.length) issues.push({ smallTargets: small });
  geo.mapTiles = embed.querySelector('.leaflet-container')?.getAttribute('data-map-tiles');
  return { geo, issues };
})()`;

const EMBED_SELECTOR = {
  'spots-embed': '[data-map-fullscreen="false"]',
  'home-hero': '[data-map-hero-teaser="true"]',
};

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.isMobile,
  });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('ventu:windRingLegendSeen', '1'); } catch {}
  });
  const page = await ctx.newPage();
  for (const t of TARGETS) {
    try {
      await page.goto(BASE + t.path, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForSelector(EMBED_SELECTOR[t.name] + ' .leaflet-container', { timeout: 45_000 });
      await page.waitForTimeout(2500);
      const res = await page.evaluate(SNIPPET(EMBED_SELECTOR[t.name]));
      console.log('### ' + vp.name + ' · ' + t.name);
      console.log(JSON.stringify(res, null, 1));
    } catch (e) {
      console.log('### ' + vp.name + ' · ' + t.name + ' ERROR: ' + String(e).slice(0, 160));
    }
  }
  await ctx.close();
}
await browser.close();
