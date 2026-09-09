/**
 * One-off audit probe for the spot popup (desktop/tablet) and the mobile
 * bottom sheet on /pt/mapa/. Measures geometry (viewport containment),
 * typography (font sizes, truncation), touch targets (WCAG floor 44px on
 * touch), hit-testing (nothing covering interactive elements) and stacking
 * (sheet vs HUD). Read-only.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:64046';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'mobile', width: 390, height: 844, touch: true },
];

const MEASURE = `(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
  };
  const hit = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return 'zero-size';
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top) return 'outside-viewport';
    return !top.contains(el) && !el.contains(top) ? 'covered-by:' + top.tagName + '.' + String(top.className).slice(0, 50) : 'ok';
  };
  const css = (el, props) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = s[p];
    return o;
  };
  const popup = document.querySelector('.spot-popup');
  const sheet = document.querySelector('[data-testid="map-spot-sheet"]');
  const out = { vw: innerWidth, vh: innerHeight };
  if (popup) {
    const content = popup.querySelector('.leaflet-popup-content');
    const close = popup.querySelector('.leaflet-popup-close-button');
    const cta = popup.querySelector('.ventu-popup-detail');
    const name = popup.querySelector('span.truncate');
    const region = [...popup.querySelectorAll('p')].find((p) => p.textContent && p.textContent.includes('·'));
    const metrics = popup.querySelectorAll('span.inline-flex');
    const scoreBadge = popup.querySelector('[aria-label*="Score"], [aria-label*=":"]');
    out.popup = {
      box: r(popup),
      content: r(content),
      withinViewport: content ? content.getBoundingClientRect().right <= innerWidth && content.getBoundingClientRect().left >= 0 && content.getBoundingClientRect().bottom <= innerHeight : null,
      close: close ? { rect: r(close), hit: hit(close) } : null,
      cta: cta ? { rect: r(cta), hit: hit(cta), css: css(cta, ['fontSize', 'lineHeight', 'minHeight', 'paddingTop', 'paddingBottom']) } : null,
      name: name ? { rect: r(name), css: css(name, ['fontSize', 'lineHeight', 'color']) , truncated: name.scrollWidth > name.clientWidth } : null,
      region: region ? { rect: r(region), css: css(region, ['fontSize', 'lineHeight']) } : null,
      scoreBadge: scoreBadge ? { rect: r(scoreBadge), hit: hit(scoreBadge) } : null,
      overlappedByControls: (() => {
        const controls = document.querySelector('[data-map-controls]');
        if (!controls || !content) return false;
        const a = content.getBoundingClientRect(), b = controls.getBoundingClientRect();
        return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      })(),
    };
  }
  if (sheet) {
    const panel = sheet;
    const backdrop = sheet.previousElementSibling && sheet.previousElementSibling.tagName === 'BUTTON' ? sheet.previousElementSibling : null;
    const closeBtn = sheet.querySelector('button[aria-label="Fechar"]');
    const actions = [...sheet.querySelectorAll('a')].filter(a => /Ver spot|View spot|Como chegar|Get directions/.test(a.textContent || ''));
    const title = sheet.querySelector('h2');
    const narrative = [...sheet.querySelectorAll('p')].find(p => p.textContent && p.textContent.length > 40);
    const hudVisible = !!document.querySelector('[data-map-hud="visible"]');
    out.sheet = {
      rect: r(panel),
      withinViewport: panel.getBoundingClientRect().right <= innerWidth && panel.getBoundingClientRect().left >= 0,
      maxH: Math.round(panel.getBoundingClientRect().height),
      scrollable: panel.scrollHeight > panel.clientHeight,
      close: closeBtn ? { rect: r(closeBtn), hit: hit(closeBtn) } : null,
      actions: actions.map(a => ({ label: (a.textContent || '').trim(), rect: r(a), hit: hit(a) })),
      title: title ? { rect: r(title), css: css(title, ['fontSize', 'lineHeight']) } : null,
      narrative: narrative ? { rect: r(narrative), css: css(narrative, ['fontSize', 'lineHeight']) } : null,
      hudStillVisible: hudVisible,
      backdrop: backdrop ? { rect: r(backdrop), hit: hit(backdrop) } : null,
    };
  }
  return out;
})()`;

async function openMap(page, vp) {
  await page.addInitScript(() => {
    localStorage.setItem('ventu:windRingLegendSeen', '1');
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto(BASE + '/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
  await page.waitForSelector('[data-map-hud="visible"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

async function clickVisibleMarker(page) {
  const pick = await page.waitForFunction(
    () => {
      const vw = innerWidth, vh = innerHeight;
      const markers = Array.from(document.querySelectorAll('.leaflet-marker-icon.spot-marker'));
      for (const m of markers) {
        const r = m.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh) {
          return { index: markers.indexOf(m) };
        }
      }
      return null;
    },
    { timeout: 30_000, polling: 250 },
  );
  const idx = (await pick.jsonValue()).index;
  if (idx === undefined || idx < 0) return false;
  // Click via a dispatched MouseEvent on the marker element itself: the
  // marker center may sit under the HUD card (bottom of the map), where a
  // force-click would hit the covering element instead of the marker.
  await page.evaluate((i) => {
    const marker = document.querySelectorAll('.leaflet-marker-icon.spot-marker')[i];
    marker?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, idx);
  return true;
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
    await openMap(page, vp);

    if (vp.width >= 768) {
      // Popup path — zoom to national view, click an in-view marker.
      const clicked = await clickVisibleMarker(page);
      if (!clicked) out.notes.push('no visible marker found');
      await page.waitForTimeout(900);
      const popup = await page.evaluate(MEASURE);
      out.measure = popup;
      if (!popup.popup) out.notes.push('popup did not open');
      else {
        const p = popup.popup;
        if (!p.withinViewport) out.issues.push('popup outside viewport');
        if (p.close && p.close.hit !== 'ok') out.issues.push('popup close covered: ' + p.close.hit);
        if (p.cta && p.cta.hit !== 'ok') out.issues.push('popup CTA covered: ' + p.cta.hit);
        if (p.cta && vp.touch && p.cta.rect.h < 44) out.issues.push('popup CTA small on touch: ' + p.cta.rect.h + 'px');
        if (p.overlappedByControls) out.issues.push('popup overlaps controls column');
        if (p.name && p.name.truncated) out.notes.push('name truncated (long spot name?)');
        if (p.close && (p.close.rect.w < 44 || p.close.rect.h < 44)) out.issues.push('popup close <44px');
      }
    } else {
      // Sheet path
      const showAll = page.getByRole('button', { name: /Mostrar todos|Show all/i });
      if (await showAll.isVisible()) await showAll.click();
      await page.waitForTimeout(800);
      const clicked = await clickVisibleMarker(page);
      if (!clicked) out.notes.push('no visible marker found');
      await page.waitForTimeout(1100);
      const sheet = await page.evaluate(MEASURE);
      out.measure = sheet;
      // Enquanto a sheet está aberta, a coluna de controlos tem de estar
      // TAPADA pelo backdrop (z-[1200]) — se os controlos ficassem por cima,
      // o utilizador clicaria através do modal (stacking bug).
      const controlsUnderModal = await page.evaluate(() => {
        const controls = document.querySelector('[data-map-controls]');
        if (!controls) return 'no-controls';
        const b = controls.getBoundingClientRect();
        const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        if (!top) return 'none';
        return top.closest('[aria-label="Fechar"]') || top.closest('[data-testid="map-spot-sheet"]')
          ? 'covered'
          : 'leak:' + top.tagName + '.' + String(top.className).slice(0, 40);
      });
      if (controlsUnderModal !== 'covered' && controlsUnderModal !== 'no-controls') {
        out.issues.push('controls clickable through modal: ' + controlsUnderModal);
      }
      if (!sheet.sheet) out.notes.push('sheet did not open');
      else {
        const s = sheet.sheet;
        if (!s.withinViewport) out.issues.push('sheet outside viewport');
        if (s.close && s.close.hit !== 'ok') out.issues.push('sheet close covered: ' + s.close.hit);
        if (s.actions.some(a => a.hit === 'covered-by:')) out.issues.push('sheet action covered: ' + JSON.stringify(s.actions.filter(a => a.hit && a.hit.startsWith('covered-by:')).map(a => a.label)));
        if (s.actions.some(a => a.rect.h < 44)) out.issues.push('sheet action <44px tall');
        if (s.actions.some(a => a.hit === 'outside-viewport')) out.notes.push('some actions below the fold on open (sheet scrolls)');
        if (s.hudStillVisible) out.notes.push('HUD element still mounted under the sheet (expected — sheet stacks above)');
        // scroll to the bottom and confirm both action buttons become tappable
        await page.evaluate(() => {
          const panel = document.querySelector('[data-testid="map-spot-sheet"]');
          if (panel) panel.scrollTop = panel.scrollHeight;
        });
        await page.waitForTimeout(350);
        const afterScroll = await page.evaluate(`(() => {
          const hit = (el) => {
            if (!el) return null;
            const b = el.getBoundingClientRect();
            const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            if (!top) return 'outside-viewport';
            return top.contains(el) || el.contains(top) ? 'ok' : 'covered';
          };
          const sheet = document.querySelector('[data-testid="map-spot-sheet"]');
          const actions = [...sheet.querySelectorAll('a')].filter(a => /Ver spot|View spot|Como chegar|Get directions/.test(a.textContent || ''));
          return actions.map(a => ({ label: (a.textContent || '').trim(), hit: hit(a) }));
        })()`);
        if (afterScroll.some(a => a.hit !== 'ok')) {
          out.issues.push('sheet actions not tappable after scroll: ' + JSON.stringify(afterScroll));
        }
        out.actionsAfterScroll = afterScroll;

        // dismiss via Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
        const gone = await page.evaluate(() => !document.querySelector('[data-testid="map-spot-sheet"]'));
        if (!gone) out.issues.push('Escape did not close sheet');
        out.sheetClosedByEscape = gone;
      }
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