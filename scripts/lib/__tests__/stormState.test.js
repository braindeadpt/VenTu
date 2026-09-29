/**
 * stormState — derivação do estado de precipitação por spot a partir de
 * frames RGBA do radar IPMA (B1). Fixtures sintéticas: grelha de pixeis
 * construída à mão, sem rede nem sharp.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  latLonToPx,
  kmPerPx,
  bearingDeg,
  echoPixels,
  spotEcho,
  approachVector,
  classifySpot,
  maxWarnLevel,
  buildStormState,
} = require('../stormState.js');

// Bounds reais do produto IPMA (mesmos que ipmaRadar.ts / radar.json)
const BOUNDS = { south: 34.011513, west: -12.454795, north: 43.792862, east: -4.345465 };
const W = 150;
const H = 233; // 1500×2331 reduzido 10×

const NAZARE = { id: 'nazare', lat: 39.60, lon: -9.07 };

/** Frame sintético: RGBA com uma mancha quadrada de eco à volta de (cx,cy). */
function makeEchoList(cx, cy, half = 5, cls = 1) {
  const px = [];
  for (let y = cy - half; y <= cy + half; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) px.push({ x, y, cls });
  }
  return px;
}

function frameOf(echoList) {
  return { w: W, h: H, bounds: BOUNDS };
}

function spotPx(spot) {
  return latLonToPx(spot.lat, spot.lon, W, H, BOUNDS);
}

describe('latLonToPx / kmPerPx', () => {
  it('canto SW da bounds → (0, h)', () => {
    const p = latLonToPx(BOUNDS.south, BOUNDS.west, W, H, BOUNDS);
    expect(Math.round(p.x)).toBe(0);
    expect(Math.round(p.y)).toBe(H);
  });

  it('Nazaré cai dentro da imagem e ~5 km/px', () => {
    const p = spotPx(NAZARE);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(W);
    const kpp = kmPerPx(NAZARE.lat, W, H, BOUNDS);
    expect(kpp.yKm).toBeGreaterThan(3);
    expect(kpp.yKm).toBeLessThan(7);
  });
});

describe('echoPixels', () => {
  it('detecta eco ciano, ignora alpha=0 e máscara preta', () => {
    const w = 4;
    const h = 3;
    const rgba = new Uint8Array(w * h * 4);
    const set = (x, y, r, g, b, a) => {
      const o = (y * w + x) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    };
    set(0, 0, 0, 180, 190, 255); // eco ciano → light
    set(1, 0, 0, 200, 0, 255);   // verde → moderate
    set(2, 0, 230, 200, 20, 255); // amarelo → heavy
    set(3, 0, 0, 0, 0, 255);     // máscara terra — não é eco
    // resto alpha 0 — fora da cobertura
    const { px } = echoPixels(rgba, w, h);
    expect(px).toHaveLength(3);
    expect(px.find((p) => p.x === 0).cls).toBe(1);
    expect(px.find((p) => p.x === 1).cls).toBe(2);
    expect(px.find((p) => p.x === 2).cls).toBe(3);
  });
});

describe('spotEcho', () => {
  it('eco centrado no spot → over, distKm ~0', () => {
    const p = spotPx(NAZARE);
    const echo = makeEchoList(Math.round(p.x), Math.round(p.y), 3);
    const r = spotEcho(NAZARE, echo, frameOf(echo));
    expect(r.state).toBe('over');
    expect(r.distKm).toBeLessThanOrEqual(2);
    expect(r.intensity).toBe('light');
  });

  it('eco a ~30 km → near com bearing do centróide', () => {
    const p = spotPx(NAZARE);
    const kpp = kmPerPx(NAZARE.lat, W, H, BOUNDS);
    // ~4,6 km/px neste raster 10× reduzido — centro a 10 px, mancha de
    // raio 3 → eco mais próximo a ~7 px ≈ 30 km.
    const off = 10;
    const echo = makeEchoList(Math.round(p.x) + off, Math.round(p.y), 3);
    const r = spotEcho(NAZARE, echo, frameOf(echo));
    expect(r.state).toBe('near');
    expect(r.distKm).toBeGreaterThan(15);
    expect(r.distKm).toBeLessThan(38);
    expect(r.dirDeg).toBeGreaterThan(70);
    expect(r.dirDeg).toBeLessThan(110); // a E do spot
  });

  it('sem eco na janela → clean', () => {
    const p = spotPx(NAZARE);
    // Mancha longínqua: canto NE da imagem (mar do Norte)
    const echo = makeEchoList(W - 5, 5, 3);
    const r = spotEcho(NAZARE, echo, frameOf(echo));
    expect(r.state).toBe('clean');
    expect(r.distKm).toBeNull();
    // mas o centróide continua a existir na caixa? Não — fora dos 150 km.
    expect(r.centroidPx).toBeNull();
    void p;
  });

  it('spot fora das bounds (Açores) → null, nunca inventa', () => {
    const az = { id: 'mosteiros', lat: 37.9, lon: -25.8 };
    expect(spotEcho(az, [], frameOf([]))).toBeNull();
  });
});

describe('approachVector / classifySpot', () => {
  it('centróide a mover-se para o spot → approaching com kmh', () => {
    const p = spotPx(NAZARE);
    const kpp = kmPerPx(NAZARE.lat, W, H, BOUNDS);
    // Eco a W do spot que anda ~20 km para E entre frames (15 min → 80 km/h)
    const off = Math.round(40 / kpp.xKm);
    const step = Math.round(20 / kpp.xKm);
    const old = makeEchoList(Math.round(p.x) - off, Math.round(p.y), 4);
    const now = makeEchoList(Math.round(p.x) - off + step, Math.round(p.y), 4);
    const fr = frameOf(now);
    const eOld = spotEcho(NAZARE, old, fr);
    const eNow = spotEcho(NAZARE, now, fr);
    const r = classifySpot(NAZARE, eNow, eOld, 15 * 60 * 1000, fr);
    expect(r.approach?.state).toBe('approaching');
    expect(r.approach.deg).toBeGreaterThan(70);
    expect(r.approach.deg).toBeLessThan(110); // para E
    expect(r.approach.kmh).toBeGreaterThan(60);
  });

  it('centróide a afastar-se → receding', () => {
    const p = spotPx(NAZARE);
    const kpp = kmPerPx(NAZARE.lat, W, H, BOUNDS);
    const off = Math.round(30 / kpp.xKm);
    const step = Math.round(20 / kpp.xKm);
    const old = makeEchoList(Math.round(p.x) - off + step, Math.round(p.y), 4); // já mais perto
    const now = makeEchoList(Math.round(p.x) - off, Math.round(p.y), 4); // recuou para W
    const fr = frameOf(now);
    const eOld = spotEcho(NAZARE, old, fr);
    const eNow = spotEcho(NAZARE, now, fr);
    const r = classifySpot(NAZARE, eNow, eOld, 15 * 60 * 1000, fr);
    expect(r.approach?.state).toBe('receding');
  });

  it('centróide quase parado → approach null (não inventa)', () => {
    const p = spotPx(NAZARE);
    const e = makeEchoList(Math.round(p.x), Math.round(p.y), 4);
    const fr = frameOf(e);
    const eNow = spotEcho(NAZARE, e, fr);
    const eOld = spotEcho(NAZARE, e, fr);
    const r = classifySpot(NAZARE, eNow, eOld, 15 * 60 * 1000, fr);
    expect(r.approach).toBeNull();
  });
});

describe('maxWarnLevel / buildStormState', () => {
  it('nível máximo vence a lista', () => {
    expect(maxWarnLevel([{ level: 'yellow' }, { level: 'orange' }, { level: 'yellow' }])).toBe('orange');
    expect(maxWarnLevel([])).toBeNull();
    expect(maxWarnLevel(null)).toBeNull();
  });

  it('payload compõe radar + warnLevel + cone por spot', () => {
    const p = spotPx(NAZARE);
    const echo = makeEchoList(Math.round(p.x), Math.round(p.y), 3);
    const frames = [{ frameTime: '2026-09-29T15:40:00Z', echoList: echo, w: W, h: H, bounds: BOUNDS }];
    const warnings = { spotWarnings: { nazare: [{ level: 'orange' }] } };
    const storms = { spotStorms: { nazare: [{ id: 'al01' }] } };
    const out = buildStormState(frames, [NAZARE], warnings, storms, '2026-09-29T15:45:00Z');
    const s = out.spots.nazare;
    expect(s.radar.state).toBe('over');
    expect(s.warnLevel).toBe('orange');
    expect(s.inStormCone).toBe(true);
    expect(out.radar.frameTime).toBe('2026-09-29T15:40:00Z');
  });

  it('bearing utilitário: E≈90', () => {
    expect(Math.abs(bearingDeg(39, -9, 39, -8) - 90)).toBeLessThan(2);
  });
});
