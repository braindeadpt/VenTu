import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:58657';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('ventu:windRingLegendSeen', '1');
  localStorage.setItem('ventu.map.cluster', '0');
});
await page.goto(BASE + '/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
await page.waitForTimeout(600);

const expand = page.locator('[aria-label="Mostrar filtros"], [aria-label="Show filters"]').first();
if (await expand.count()) {
  await expand.click().catch(() => {});
  await page.waitForTimeout(600);
}

// Find the VISIBLE Algarve pill
const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Algarve');
  const vis = btns.filter((b) => b.getBoundingClientRect().width > 4 && b.getBoundingClientRect().height > 4);
  const pick = vis[0] || btns[0];
  if (!pick) return { found: false, n: btns.length };
  const r = pick.getBoundingClientRect();
  const cs = getComputedStyle(pick);
  const range = document.createRange();
  range.selectNodeContents(pick.firstChild);
  const tr = range.getBoundingClientRect();
  const pts = [
    ['tl', Math.round(tr.x + 2), Math.round(tr.y + 2)],
    ['tr', Math.round(tr.right - 2), Math.round(tr.y + 2)],
    ['bl', Math.round(tr.x + 2), Math.round(tr.bottom - 2)],
    ['br', Math.round(tr.right - 2), Math.round(tr.bottom - 2)],
    ['center', Math.round(tr.x + tr.width / 2), Math.round(tr.y + tr.height / 2)],
  ];
  const at = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? { tag: el.tagName, cls: String(el.className || '').slice(0, 40) } : null;
  };
  return {
    found: true,
    n: btns.length,
    nVisible: vis.length,
    btnRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    btnBg: cs.backgroundColor,
    txtRect: { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) },
    pts: pts.map(([label, x, y]) => ({ label, x, y, hit: at(x, y) })),
  };
});

const shot = await page.screenshot({ encoding: 'base64' });
const b64 = Buffer.isBuffer(shot) ? shot.toString('base64') : shot;
const px = await page.evaluate(async ({ b64, pts }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return { imgW: img.width, imgH: img.height, pts: pts.map((p) => {
    try {
      const d = g.getImageData(p.x, p.y, 1, 1).data;
      return { label: p.label, rgb: [d[0], d[1], d[2]] };
    } catch (e) {
      return { label: p.label, err: String(e) };
    }
  }) };
}, { b64, pts: info.pts });

console.log(JSON.stringify({ info, px }, null, 2));
await browser.close();