/**
 * One-off audit probe for the MapExploreHud ("Modo explorar") on /pt/mapa/:
 * geometry of the card and its rows, overflow, touch targets, horizontal
 * scroll strips, time track and the collapse/filter interactions. Read-only
 * except clicking to expand/filter (no persistence: fresh context each run).
 */
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:52393';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'laptop', width: 1024, height: 768, touch: false },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'mobile', width: 390, height: 844, touch: true },
  { name: 'small', width: 360, height: 800, touch: true },
];

const MEASURE = `(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
  };
  const region = document.querySelector('[aria-label="Modo explorar"]');
  if (!region) return { missing: true };
  const card = region.querySelector('div');
  const cb = card.getBoundingClientRect();
  const issues = [];
  // 1. card within viewport horizontally
  if (cb.right > innerWidth + 1 || cb.left < -1) issues.push('card off-screen horizontally');
  // 2. horizontal overflow inside the card — IGNORING elements inside
  //    overflow-x-auto strips (their children legitimately extend beyond the
  //    visible width — that is the scroll). Only a non-scrolled element
  //    sticking out of the card is a real defect.
  const overflowers = [];
  const stripEls = [...card.querySelectorAll('div')].filter((d) => /overflow-x-auto/.test(d.className));
  const inStrip = (el) => stripEls.some((s) => s !== el && s.contains(el));
  card.querySelectorAll('*').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return;
    if (inStrip(el)) return;
    if (b.right > cb.right + 1 || b.left < cb.left - 1) {
      overflowers.push((el.className && String(el.className).slice(0, 60)) || el.tagName);
    }
  });
  if (overflowers.length) issues.push('overflow inside card: ' + JSON.stringify(overflowers.slice(0, 8)));
  // 2b. last button of each scroll strip must be reachable (scroll to end)
  stripEls.forEach((s) => {
    const btns = [...s.querySelectorAll('button, a')];
    if (!btns.length) return;
    const last = btns[btns.length - 1].getBoundingClientRect();
    const srect = s.getBoundingClientRect();
    s.scrollLeft = s.scrollWidth;
    const after = btns[btns.length - 1].getBoundingClientRect();
    s.scrollLeft = 0;
    const reachable = after.right <= srect.right + 1 && after.left >= srect.left - 1;
    if (!reachable) issues.push('last strip button not reachable: ' + String((last.width > 0 ? btns[btns.length - 1].getAttribute('aria-label') || '' : '')).slice(0, 30));
  });
  // 3. header row
  const headerRow = [...card.querySelectorAll('div')].find((d) => d.className.includes('flex-wrap'));
  const header = headerRow ? { rect: r(headerRow), items: [...headerRow.children].map((c) => ({ cls: String(c.className).slice(0, 40), rect: r(c) })) } : null;
  if (header && header.rect && header.items.some((i) => i.rect && i.rect.r > cb.right + 1)) issues.push('header row overflow');
  // 4. horizontal scroll strips (mobile layer strip + filter rows)
  const strips = [...card.querySelectorAll('div')]
    .filter((d) => /overflow-x-auto/.test(d.className))
    .map((d) => ({ scrollW: d.scrollWidth, clientW: d.clientWidth, scrollable: d.scrollWidth > d.clientWidth + 2, edgeFade: /edge-fade-x/.test(d.className), label: (d.getAttribute('aria-label') || '').slice(0, 20) }));
  const stuckStrips = strips.filter((s) => s.scrollable && !s.edgeFade);
  if (stuckStrips.length) issues.push('scrollable strip without edge-fade: ' + JSON.stringify(stuckStrips));
  // 5. time track
  const track = card.querySelector('[data-map-time-track]');
  const timeTrack = track ? {
    rect: r(track),
    play: (() => { const b = track.querySelector('[data-radar-toggle], [data-map-hours-play]'); const bb = b?.getBoundingClientRect(); return bb ? { w: Math.round(bb.width), h: Math.round(bb.height) } : null; })(),
    slider: (() => { const s = track.querySelector('input[type="range"]'); const bb = s?.getBoundingClientRect(); return bb ? { w: Math.round(bb.width), h: Math.round(bb.height) } : null; })(),
    clock: (() => { const c = [...track.querySelectorAll('span')].find((s) => /\\d{2}h/.test(s.textContent || '')); const bb = c?.getBoundingClientRect(); return bb ? { w: Math.round(bb.width) } : null; })(),
    tideChip: (() => { const t = track.querySelector('[data-map-tide-chip]'); const bb = t?.getBoundingClientRect(); return bb ? { w: Math.round(bb.width), h: Math.round(bb.height) } : null; })(),
    thermalChip: (() => { const t = track.querySelector('[data-map-thermal-chip]'); const bb = t?.getBoundingClientRect(); return bb ? { w: Math.round(bb.width), h: Math.round(bb.height) } : null; })(),
  } : null;
  if (timeTrack) {
    if (timeTrack.play && (timeTrack.play.w < 44 || timeTrack.play.h < 44)) issues.push('time-track play <44px');
    if (timeTrack.slider && timeTrack.slider.w < 60) issues.push('time-track slider too narrow: ' + timeTrack.slider.w + 'px');
  }
  // 6. all interactive buttons ≥44 on touch (below lg)
  if (innerWidth < 1024) {
    const small = [];
    card.querySelectorAll('button, a').forEach((b) => {
      const bb = b.getBoundingClientRect();
      if (bb.width > 0 && bb.height > 0 && (bb.width < 44 || bb.height < 44)) {
        small.push({ label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24), w: Math.round(bb.width), h: Math.round(bb.height) });
      }
    });
    if (small.length) issues.push('small touch targets: ' + JSON.stringify(small.slice(0, 12)));
  }
  // 7. legend vs HUD: legend must sit above the card (lifted)
  const legend = document.querySelector('[aria-label="Legenda do mapa"]');
  const legendBottom = legend ? legend.getBoundingClientRect().bottom : null;
  const legendOverlaps = legendBottom != null && legendBottom > cb.top + 1;
  if (legendOverlaps) issues.push('legend overlaps HUD card (legendBottom ' + Math.round(legendBottom) + ' > cardTop ' + Math.round(cb.top) + ')');
  return {
    vw: innerWidth,
    card: r(card),
    cardTop: Math.round(cb.top),
    header,
    strips: strips.map((s) => ({ ...s, label: s.label || undefined })),
    timeTrack,
    collapsed: region.getAttribute('data-map-hud-collapsed'),
    legendBottom: legendBottom != null ? Math.round(legendBottom) : null,
    issues,
  };
})()`;

async function openMapa(page, qs = '') {
  await page.addInitScript(() => {
    localStorage.setItem('ventu:windRingLegendSeen', '1');
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
  });
  await page.goto(BASE + '/pt/mapa/' + qs, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
  await page.waitForSelector('[data-map-hud="visible"], [aria-label="Modo explorar"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.width < 600,
  });
  const page = await ctx.newPage();
  const out = { viewport: vp.name, issues: [], notes: [] };
  try {
    // Default state (no hours)
    await openMapa(page);
    const m1 = await page.evaluate(MEASURE);
    out.default = m1;
    out.issues.push(...(m1.issues || []));

    // With hours + tide chip (time track visible)
    await openMapa(page, '?hours=1');
    const m2 = await page.evaluate(MEASURE);
    out.withHours = m2;
    out.issues.push(...(m2.issues || []).map((i) => 'hours: ' + i));

    // Interactions
    if (vp.width < 768) {
      // expand
      const expand = page.locator('[aria-label="Mostrar filtros"], [aria-label="Show filters"]').first();
      if (await expand.count()) {
        await expand.click().catch(() => {});
        await page.waitForTimeout(500);
        const expanded = await page.evaluate(MEASURE);
        out.expanded = expanded;
        out.issues.push(...(expanded.issues || []).map((i) => 'expanded: ' + i));
      } else {
        out.notes.push('no expand button (mobile)');
      }
    }

    // Filter interaction: click a sport chip, expect URL; then clear filters
    const sportChip = page.getByRole('button', { name: 'Kitesurf', exact: true }).first();
    if (await sportChip.count()) {
      await sportChip.click().catch(() => {});
      await page.waitForTimeout(700);
      const url = page.url();
      if (!/sport=kitesurf/.test(url)) out.issues.push('sport chip did not sync URL: ' + url.slice(-60));
      const clear = page.getByRole('button', { name: /Limpar filtros|Clear filters/i }).first();
      if (await clear.count()) {
        await clear.click().catch(() => {});
        await page.waitForTimeout(500);
        if (/sport=kitesurf/.test(page.url())) out.issues.push('clear filters did not reset URL');
      } else {
        out.issues.push('clear-filters button missing after filter set');
      }
    } else {
      out.notes.push('no Kitesurf chip found');
    }

    // Time-track scrub (hours mode): slider exists and scrubs — the clock
    // text must change (same assertion as the map-hours e2e spec).
    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]').first();
    if (await slider.count()) {
      const clockBefore = (await page.locator('[data-map-time-track-mode="hours"]').textContent()).match(/\d{2}h/)?.[0];
      await slider.fill('5').catch(() => {});
      await page.waitForTimeout(500);
      const clockAfter = (await page.locator('[data-map-time-track-mode="hours"]').textContent()).match(/\d{2}h/)?.[0];
      out.scrub = { before: clockBefore, after: clockAfter };
      if (!clockAfter || clockAfter === clockBefore) out.issues.push('time-track scrub did not advance clock');
    } else {
      out.notes.push('no hours scrubber');
    }
  } catch (e) {
    out.issues.push('AUDIT ERROR: ' + String(e).slice(0, 200));
  } finally {
    await ctx.close();
  }
  console.log('### ' + vp.name);
  console.log(JSON.stringify(out, null, 1));
}
await browser.close();