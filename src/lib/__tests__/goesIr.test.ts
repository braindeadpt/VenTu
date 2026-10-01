/**
 * goesIr — slots de 10 min do GOES-East ABI Band 13 no GIBS (B5).
 * Determinístico: `goesIrFrames(nowMs)` recebe o relógio.
 */
import { describe, it, expect } from 'vitest';
import {
  goesIrFrames,
  goesIrTileUrl,
  goesIrFrameClock,
  goesIrFrameFullClock,
  GOES_IR_BOUNDS,
  GOES_IR_LAYER,
  GOES_IR_MATRIX_SET,
  GOES_IR_FRAME_COUNT,
  GOES_IR_CADENCE_MIN,
  GOES_IR_LAG_MS,
} from '@/lib/goesIr';
import { radarMissingFrames } from '@/lib/ipmaRadar';

const NOW = Date.parse('2026-09-29T22:08:05Z');
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;

describe('goesIrFrames', () => {
  it('devolve N slots de 10 min, mais recente primeiro', () => {
    const frames = goesIrFrames(NOW);
    expect(frames).toHaveLength(GOES_IR_FRAME_COUNT);
    for (const f of frames) {
      expect(f.frameTime).toMatch(ISO_RE);
      expect(f.url).toContain(f.frameTime);
    }
    for (let i = 0; i + 1 < frames.length; i += 1) {
      const delta = Date.parse(frames[i].frameTime) - Date.parse(frames[i + 1].frameTime);
      expect(delta).toBe(GOES_IR_CADENCE_MIN * 60_000);
    }
  });

  it('o slot mais recente fica ~GOES_IR_LAG_MS atrás e alinhado à cadência', () => {
    const newest = Date.parse(goesIrFrames(NOW)[0].frameTime);
    const lag = NOW - newest;
    // Alinhado a múltiplo de 10 min → lag real ∈ [lag, lag+cadence).
    expect(lag).toBeGreaterThanOrEqual(GOES_IR_LAG_MS);
    expect(lag).toBeLessThan(GOES_IR_LAG_MS + GOES_IR_CADENCE_MIN * 60_000);
    // 22:08:05 − 45 min = 21:23:05 → floor 10 min → 21:20:00Z
    expect(goesIrFrames(NOW)[0].frameTime).toBe('2026-09-29T21:20:00Z');
  });

  it('a janela cobre ~2 h passadas (12 × 10 min)', () => {
    const frames = goesIrFrames(NOW);
    const span = Date.parse(frames[0].frameTime) - Date.parse(frames[11].frameTime);
    expect(span).toBe(110 * 60_000);
  });
});

describe('goesIrTileUrl', () => {
  it('monta a URL REST WMTS com camada, tempo, matriz e placeholders', () => {
    const url = goesIrTileUrl('2026-09-29T21:20:00Z');
    expect(url).toContain(`/best/${GOES_IR_LAYER}/`);
    expect(url).toContain('/2026-09-29T21:20:00Z/');
    expect(url).toContain(`/${GOES_IR_MATRIX_SET}/{z}/{y}/{x}.png`);
  });
});

describe('goesIrFrameClock / goesIrFrameFullClock', () => {
  it('converte UTC real para hora de Lisboa (verão = UTC+1)', () => {
    // 29 Set 2026 → WEST (UTC+1): 21:20Z → 22:20 em Lisboa.
    expect(goesIrFrameClock('2026-09-29T21:20:00Z')).toBe('22:20');
    expect(goesIrFrameFullClock('2026-09-29T21:20:00Z')).toBe('2026-09-29 22:20');
  });

  it('entrada inválida → null, nunca lança', () => {
    expect(goesIrFrameClock(null)).toBeNull();
    expect(goesIrFrameClock('lixo')).toBeNull();
    expect(goesIrFrameFullClock('')).toBeNull();
  });
});

describe('GOES_IR_BOUNDS — disco com margem, sem cortar o Atlântico', () => {
  // O TileLayer pede só dentro destes bounds: ao fazer zoom-out não pede o
  // vazio (Pacífico/Ásia), onde o GIBS só serve preto. Generoso de
  // propósito — cortar um pixel válido do limbo seria pior que mascarar.
  const inside = ([lat, lon]: [number, number]) => {
    const [[s, w], [n, e]] = GOES_IR_BOUNDS;
    return lat >= s && lat <= n && lon >= w && lon <= e;
  };

  it.each([
    ['Lisboa', [38.7, -9.1]],
    ['Porto', [41.1, -8.6]],
    ['Açores (Ponta Delgada)', [37.7, -25.7]],
    ['Madeira', [32.7, -16.9]],
    ['Atlântico médio', [30, -40]],
    ['costa leste EUA', [35, -75]],
  ] as Array<[string, [number, number]]>)('%s dentro dos bounds', (_name, ll) => {
    expect(inside(ll)).toBe(true);
  });

  it.each([
    ['Tóquio', [35.7, 139.7]],
    ['Sydney', [-33.9, 151.2]],
    ['Pacífico oeste', [0, 150]],
  ] as Array<[string, [number, number]]>)('%s fora dos bounds (vazio não pedido)', (_name, ll) => {
    expect(inside(ll)).toBe(false);
  });
});

describe('radarMissingFrames com cadência explícita', () => {
  const frames = goesIrFrames(NOW);
  it('cadência 10 min contígua → zero gaps (sem falsos «1 em falta»)', () => {
    expect(radarMissingFrames(frames, 10)).toEqual(new Array(frames.length).fill(0));
  });

  it('slot de 10 min em falta → conta 1', () => {
    const withGap = frames.filter((_, i) => i !== 1);
    const missing = radarMissingFrames(withGap, 10);
    expect(missing[0]).toBe(1);
  });
});
