/**
 * One-off HUD footprint probe (desktop + mobile) for /pt/mapa/.
 * Measures the "Modo explorar" HUD card geometry and the fraction of the map
 * viewport it covers; on mobile also samples compact-state chip contrast.
 * Read-only; writes a text report to OUT.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.AUDIT_BASE || 'http://localhost:5299';
const OUT = process.env.OUT || '/tmp/hud-footprint.txt';
const lines = [];
const p = (...a) => lines.push(a.join(' '));

const VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'desktop 1280x800', width: 1280, height: 800 },
  { name: 'desktop 1024x768 (lg floor)', width: 1024, height: 768 },
  { name: 'laptop 1024x640 (short)', width: 1024, height: 640 },
  { name: 'touch laptop 1280x800', width: 1280, height: 800, hasTouch: true },
  { name: 'mobile 390x844', width: 390, height: 844, hasTouch: true },
];

const browser = await chromium.launch();

for (const v of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    hasTouch: !!v.hasTouch,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pt/mapa/`, { waitUntil: 'load' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const hud = document.querySelector('[data-map-hud-collapsed]');
    const card = hud ? hud.firstElementChild?.getBoundingClientRect() : null;
    const legend = document.querySelector('[aria-label="Legenda do mapa"]');
    const legendBox = legend ? legend.getBoundingClientRect() : null;
    const rows = hud ? hud.querySelectorAll('[role="group"], [role="radiogroup"]') : [];
    const rowBoxes = [...rows].map((r) => Math.round(r.getBoundingClientRect().height));
    const pb = hud ? parseFloat(getComputedStyle(hud).paddingBottom) : 0;
    return { vw, vh, pb, rowBoxes, legendBox, card,
      collapsed: hud ? hud.getAttribute('data-map-hud-collapsed') : null };
  });

  p(`### ${v.name}`);
  if (!m.card) {
    p('  HUD: NOT FOUND');
  } else {
    // Fullscreen map area = 100dvh - 4rem header.
    const mapH = m.vh - 64;
    const coveredH = Math.max(0, m.vh - m.card.top);
    const pct = ((coveredH / mapH) * 100).toFixed(1);
    // Hypothetical compact card: header row 44 + vertical padding (~20) + borders (~2).
    const compactCovered = m.pb + 68;
    const pctCompact = ((compactCovered / mapH) * 100).toFixed(1);
    p(`  card: top=${Math.round(m.card.top)} h=${Math.round(m.card.height)} w=${Math.round(m.card.width)} (viewport ${m.vw}x${m.vh})`);
    p(`  rows: ${m.rowBoxes.join(', ')} | collapsed-attr=${m.collapsed}`);
    p(`  covered below card top: ${Math.round(coveredH)}px = ${pct}% of map (${Math.round(mapH)}px)`);
    p(`  hypothetical compact (header-only): ~${Math.round(compactCovered)}px = ${pctCompact}% of map`);
    if (m.legendBox) {
      const overlap = Math.max(0, m.legendBox.bottom - m.card.top);
      p(`  legend: bottom=${Math.round(m.legendBox.bottom)} h=${Math.round(m.legendBox.height)} ${overlap > 0 ? `OVERLAPS HUD by ${Math.round(overlap)}px` : '(clear of HUD)'}`);
    }
    if (v.hasTouch) {
      // Compact-state contrast: inactive chip text vs header background.
      const s = await page.evaluate(() => {
        const fg = (el) => getComputedStyle(el).color;
        const bg = (el) => getComputedStyle(el).backgroundColor;
        const chip = document.querySelector('[data-map-hud-collapsed] [role="group"] button:not([aria-pressed="true"])');
        const header = document.querySelector('[data-map-hud-collapsed] > div');
        const pill = document.querySelector('.pill-ghost');
        const lum = (c) => {
          const [r, g, b] = c.match(/\d+/g).map(Number).slice(0, 3).map((x) => {
            const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a, b) => {
          const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
          return ((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
        };
        return chip && header
          ? { chipFg: fg(chip), headerBg: bg(header), ratio: ratio(fg(chip), bg(header)) }
          : null;
      });
      if (s) p(`  compact contrast (inactive chip vs header bg): ${s.ratio}:1 (${s.chipFg} on ${s.headerBg})`);
    }
  }
  await ctx.close();
}

await browser.close();
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nwrote ${OUT} (${lines.length} lines)`);
