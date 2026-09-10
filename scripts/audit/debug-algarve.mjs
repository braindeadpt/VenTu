import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:58657';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('ventu:windRingLegendSeen', '1');
  localStorage.setItem('ventu.map.cluster', '0');
});
await page.goto(BASE + '/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
await page.waitForTimeout(600);

// Open the popup like the audit probe does (mobile-expanded)
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
await page.waitForTimeout(1500);

const info = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Algarve');
  if (!btn) return { found: false };
  const r = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  const txt = btn.firstChild;
  const range = document.createRange();
  range.selectNodeContents(txt);
  const tr = range.getBoundingClientRect();
  // What's at the text's bottom-left corner +2?
  const probe = [
    { label: 'bottom-left+2', x: Math.round(tr.x + 2), y: Math.round(tr.bottom - 2) },
    { label: 'top-right-2', x: Math.round(tr.right - 2), y: Math.round(tr.y + 2) },
  ];
  const hits = probe.map((p) => {
    const el = document.elementFromPoint(p.x, p.y);
    return { label: p.label, x: p.x, y: p.y, el: el ? (el.className?.slice?.(0, 40) || el.tagName) : null };
  });
  const chain = [];
  let a = btn;
  while (a && chain.length < 8) {
    const ar = a.getBoundingClientRect();
    chain.push({ tag: a.tagName, cls: String(a.className || '').slice(0, 50), rect: { x: Math.round(ar.x), y: Math.round(ar.y), w: Math.round(ar.width), h: Math.round(ar.height) }, display: getComputedStyle(a).display, visible: getComputedStyle(a).visibility });
    a = a.parentElement;
  }
  return {
    found: true,
    dpr: window.devicePixelRatio,
    chain,
    btnRect: { x: r.x, y: r.y, w: r.width, h: r.height },
    btnBg: cs.backgroundColor,
    btnColor: cs.color,
    txtRect: { x: tr.x, y: tr.y, w: tr.width, h: tr.height },
    hits,
    hudCard: (() => {
      const card = document.querySelector('[aria-label="Modo explorar"] .pointer-events-auto');
      if (!card) return null;
      const cr = card.getBoundingClientRect();
      const ccs = getComputedStyle(card);
      return { rect: { x: cr.x, y: cr.y, w: cr.width, h: cr.height }, bg: ccs.backgroundColor, z: ccs.zIndex };
    })(),
  };
});

const shot = await page.screenshot({ encoding: 'base64' });
const b64 = Buffer.isBuffer(shot) ? shot.toString('base64') : shot;
const px = await page.evaluate(async ({ b64, points }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return points.map((p) => {
    try {
      const d = g.getImageData(p.x, p.y, 1, 1).data;
      return { label: p.label, rgb: [d[0], d[1], d[2]], imgW: img.width, imgH: img.height };
    } catch {
      return { label: p.label, rgb: null };
    }
  });
}, { b64, points: info.hits });

console.log(JSON.stringify({ ...info, px }, null, 2));
await browser.close();