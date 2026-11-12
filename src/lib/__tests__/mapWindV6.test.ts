import { describe, expect, it } from 'vitest';
import {
  WIND_V6_BINS,
  WIND_V6_STAGE_ALPHA,
  bucketWindV6,
  drawWindV6,
  pushWindV6Tail,
  windV6Alpha,
  windV6Bin,
  windV6Rgb,
  windV6Stage,
  windV6StaticArrows,
  windV6Width,
  type WindV6Particle,
} from '../mapWindV6';

const view = { width: 400, height: 300 };
const id = (lat: number, lon: number) => ({ x: lon, y: lat });

describe('mapWindV6 — cor, alfa e espessura (maquete corV/alfa/largura)', () => {
  it('vai do gelo (#7FE7FF) à espuma (#F3F8FB) entre 6 e 20 nós', () => {
    expect(windV6Rgb(0)).toBe('127 231 255');
    expect(windV6Rgb(6)).toBe('127 231 255');
    expect(windV6Rgb(20)).toBe('243 248 251');
    expect(windV6Rgb(35)).toBe('243 248 251');
    expect(windV6Rgb(13)).toBe('185 240 253');
  });

  it('degraus monótonos e dentro dos limites', () => {
    expect(windV6Bin(0)).toBe(0);
    expect(windV6Bin(40)).toBe(WIND_V6_BINS - 1);
    let prev = -1;
    for (let kt = 0; kt <= 30; kt += 0.5) {
      const b = windV6Bin(kt);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it('alfa e espessura sobem com a força e têm tecto', () => {
    expect(windV6Alpha(2)).toBeLessThan(windV6Alpha(15));
    expect(windV6Alpha(50)).toBeCloseTo(0.72, 5);
    expect(windV6Width(25, false)).toBeCloseTo(1.95, 5);
    expect(windV6Width(25, true)).toBeLessThan(windV6Width(25, false));
  });
});

describe('mapWindV6 — cauda', () => {
  it('corta ao comprimento máximo e mantém a cabeça no fim', () => {
    const p: WindV6Particle = { lat: 0, lon: 0, kt: 10 };
    for (let i = 0; i < 30; i++) pushWindV6Tail(p, i, i, 5);
    expect(p.tail).toHaveLength(10);
    expect(p.tail!.slice(-2)).toEqual([29, 29]);
  });

  it('um salto grande recomeça a cauda (sem riscos no ecrã)', () => {
    const p: WindV6Particle = { lat: 0, lon: 0, kt: 10, tail: [0, 0, 2, 2] };
    pushWindV6Tail(p, 200, 200, 10);
    expect(p.tail).toEqual([200, 200]);
  });

  it('três troços da cauda para a cabeça', () => {
    expect(windV6Stage(0, 9)).toBe(0);
    expect(windV6Stage(4, 9)).toBe(1);
    expect(windV6Stage(8, 9)).toBe(2);
    expect(WIND_V6_STAGE_ALPHA[0]).toBeLessThan(WIND_V6_STAGE_ALPHA[2]);
  });
});

describe('mapWindV6 — desenho agrupado', () => {
  it('agrupa por degrau e troço; o número de strokes não depende das partículas', () => {
    const ps: WindV6Particle[] = Array.from({ length: 200 }, (_, i) => ({ lat: 100, lon: 100 + (i % 50), kt: 4 + (i % 20) }));
    // 6 frames: a partícula anda 1 px por frame
    let strokes = 0;
    const calls: string[] = [];
    const ctx = {
      clearRect: () => calls.push('clear'),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => calls.push('stroke'),
      lineCap: '',
      lineJoin: '',
      lineWidth: 0,
      strokeStyle: '',
    } as unknown as CanvasRenderingContext2D;
    for (let f = 0; f < 6; f++) {
      for (const p of ps) p.lat += 1;
      strokes = drawWindV6(ctx, ps, id, view, 18, false);
    }
    expect(strokes).toBeLessThanOrEqual(WIND_V6_BINS * 3);
    expect(calls.filter((c) => c === 'clear')).toHaveLength(6);
    for (const p of ps) expect(p.tail!.length).toBe(12);
  });

  it('segmentos fora do ecrã ficam de fora', () => {
    const p: WindV6Particle = { lat: -100, lon: -100, kt: 10, tail: [-100, -100] };
    const { segs } = bucketWindV6([p], () => ({ x: -90, y: -90 }), view, 18, false);
    expect(segs.every((s) => s.length === 0)).toBe(true);
  });
});

describe('mapWindV6 — grelha estática (reduced-motion)', () => {
  it('um traço por célula com vento, na direcção para onde sopra', () => {
    // vento de norte → sopra para sul → no ecrã, para baixo
    const arrows = windV6StaticArrows(200, 200, () => ({ u: 0, v: -5, kt: 12 }), false);
    expect(arrows.length).toBeGreaterThan(10);
    for (const a of arrows) expect(a.y2).toBeGreaterThan(a.y1);
  });

  it('sem vento (terra, fora do campo) não desenha', () => {
    expect(windV6StaticArrows(200, 200, () => null, true)).toHaveLength(0);
  });

  it('o comprimento sobe com a força e tem tecto', () => {
    const len = (kt: number) => {
      const [a] = windV6StaticArrows(48, 48, () => ({ u: 1, v: 0, kt }), false);
      return Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
    };
    expect(len(5)).toBeLessThan(len(20));
    expect(len(80)).toBeCloseTo(48 * 0.85, 5);
  });
});
