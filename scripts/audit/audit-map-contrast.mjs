/**
 * Contraste REAL dos overlays do mapa sobre os tiles: para cada elemento de
 * texto nos overlays (legenda, HUD, controlos, popup, sheet, chips), amostra
 * o pixel do screenshot no centro do elemento (a composição real: bg próprio
 * translúcido + tile por trás) e calcula o rácio WCAG vs a cor do texto.
 * Sinaliza texto normal < 4.5:1 e texto grande (<18.66px bold ou <24px) < 3:1.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://localhost:58657';

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
function parseColor(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a] = m[1].split(/,\s*/).map(Number);
  return [r, g, b];
}

const CONTAINERS =
  '[aria-label="Legenda do mapa"], [aria-label="Map legend"], [aria-label="Modo explorar"], [aria-label="Explore mode"], [data-map-controls], .spot-popup, [data-testid="map-spot-sheet"], [data-map-tide-chip], [data-map-thermal-chip], .leaflet-control-attribution';

async function collect(page) {
  return page.evaluate((sel) => {
    const parseColor = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b] = m[1].split(/,\s*/).map(Number);
      return [r, g, b];
    };
    const out = [];
    document.querySelectorAll(sel).forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const text = n.textContent.trim();
        if (!text) continue;
        const el = n.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        // Skip subtrees hidden by an ancestor (e.g. the desktop-only
        // filter rows rendered with `hidden md:flex` on mobile — their
        // text nodes are measurable-but-invisible and sample black).
        let hidden = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.display === 'none' || acs.visibility === 'hidden') {
            hidden = true;
            break;
          }
        }
        if (hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const color = parseColor(cs.color);
        if (!color) continue;
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        // 4 pontos de fundo em offset (nunca em cima do glifo): canto
        // superior-esquerdo interior, superior-direito, inferior-esquerdo,
        // inferior-direito. Cada ponto só é válido se estiver DENTRO do
        // viewport e se o elemento nesse pixel for o próprio el (ou um seu
        // descendente) — pontos cobertos por outros overlays (backdrop da
        // sheet) ou recortados por tiras de scroll (canto fora do viewport)
        // são descartados; se nenhum ponto sobreviver, o elemento é ignorado.
        const corners = [
          [Math.round(r.x + 2), Math.round(r.y + 2)],
          [Math.round(r.right - 2), Math.round(r.y + 2)],
          [Math.round(r.x + 2), Math.round(r.bottom - 2)],
          [Math.round(r.right - 2), Math.round(r.bottom - 2)],
        ];
        const box = [];
        for (const [cx, cy] of corners) {
          if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
          const hit = document.elementFromPoint(cx, cy);
          if (!hit) continue;
          if (hit !== el && !el.contains(hit)) continue;
          box.push(cx, cy);
        }
        if (box.length === 0) continue;
        out.push({
          text: text.slice(0, 24),
          el: el.getAttribute('data-testid') || el.className?.slice?.(0, 30) || el.tagName,
          color,
          large,
          box,
        });
      }
    });
    return out;
  }, CONTAINERS);
}

async function sample(page, points, fg) {
  const shot = await page.screenshot({ encoding: 'base64' });
  const b64 = Buffer.isBuffer(shot) ? shot.toString('base64') : shot;
  return page.evaluate(
    async ({ b64, points, fg }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      return points.map((p, i) => {
        try {
          let best = null;
          let bestD = -1;
          for (let k = 0; k < p.length; k += 2) {
            const d = g.getImageData(p[k], p[k + 1], 1, 1).data;
            const rgb = [d[0], d[1], d[2]];
            const dd = dist(rgb, fg[i]);
            if (dd > bestD) {
              bestD = dd;
              best = rgb;
            }
          }
          return best;
        } catch {
          return null;
        }
      });
    },
    { b64, points, fg },
  );
}

async function runState(page, label, results, theme) {
  await page.waitForTimeout(1200);
  const pts = await collect(page);
  const bgs = await sample(page, pts.map((p) => p.box), pts.map((p) => p.color));
  const fails = [];
  pts.forEach((p, i) => {
    if (!bgs[i]) return;
    const ratio = contrast(p.color, bgs[i]);
    const min = p.large ? 3 : 4.5;
    if (ratio < min) {
      fails.push({
        text: p.text,
        el: String(p.el).slice(0, 34),
        ratio: ratio.toFixed(2),
        large: p.large,
        fg: p.color.join(','),
        bg: bgs[i].join(','),
      });
    }
  });
  results[label] = { samples: pts.length, fails };
  console.log(`[${theme}] ${label}: ${pts.length} amostras, ${fails.length} falhas`);
}

async function openMap(page, theme, qs = '') {
  await page.addInitScript(() => {
    localStorage.setItem('ventu:windRingLegendSeen', '1');
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto(BASE + '/pt/mapa/' + qs, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
  await page.waitForSelector('[aria-label="Modo explorar"]', { timeout: 30_000 });
  if (theme === 'ocean') {
    await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
    await page.waitForTimeout(400);
  }
}

const browser = await chromium.launch();
for (const theme of ['dark', 'ocean']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = { theme };
  await openMap(page, theme);
  await runState(page, 'desktop-default', results, theme);
  // popup — prefere um marcador cujo popup inclua a pill de relação de vento
  // (pior caso de contraste: Onshore em texto 10px); fallback: primeiro
  // marcador com centro descoberto.
  await page.evaluate(() => {
    const open = (m) => m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const clear = () => { document.querySelector('.leaflet-popup-close-button')?.click?.(); };
    const markers = [...document.querySelectorAll('.leaflet-marker-icon.spot-marker')];
    for (const m of markers) {
      const r = m.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top || !(top === m || m.contains(top)) || r.top <= 0 || r.bottom >= innerHeight) continue;
      clear();
      open(m);
      if ((document.querySelector('.spot-popup')?.textContent || '').includes('Onshore')) return;
    }
    // fallback: primeiro com centro descoberto
    for (const m of markers) {
      const r = m.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && (top === m || m.contains(top)) && r.top > 0 && r.bottom < innerHeight) {
        open(m);
        return;
      }
    }
  });
  await runState(page, 'desktop-popup', results, theme);
  // layers
  await ctx.close();

  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mpage = await mctx.newPage();
  await openMap(mpage, theme);
  await runState(mpage, 'mobile-collapsed', results, theme);
  const expand = mpage.locator('[aria-label="Mostrar filtros"], [aria-label="Show filters"]').first();
  if (await expand.count()) {
    await expand.click().catch(() => {});
    await mpage.waitForTimeout(500);
  }
  await runState(mpage, 'mobile-expanded', results, theme);
  await mpage.evaluate(() => {
    const open = (m) => m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const markers = [...document.querySelectorAll('.leaflet-marker-icon.spot-marker')];
    for (const m of markers) {
      const r = m.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && (top === m || m.contains(top)) && r.top > 0 && r.bottom < innerHeight) {
        open(m);
        return;
      }
    }
  });
  await runState(mpage, 'mobile-sheet', results, theme);
  await mctx.close();

  console.log('### theme=' + theme);
  console.log(JSON.stringify(results, null, 1));
}
await browser.close();