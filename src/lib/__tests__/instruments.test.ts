import { describe, expect, it } from 'vitest';
import { cardinal16, idealSector, inSector } from '@/lib/instruments/sector';
import { unwrapAngle } from '@/lib/instruments/unwrapAngle';
import { nextTideExtremum, tideDirectionAt, tideExtrema } from '@/lib/instruments/tideExtrema';

describe('idealSector', () => {
  it('"N, NNW" → arco curto a atravessar o N', () => {
    expect(idealSector('N, NNW')).toEqual([326.25, 371.25]);
  });

  it('"SW, W" → arco SW–W sem wrap', () => {
    expect(idealSector('SW, W')).toEqual([213.75, 281.25]);
  });

  it('"NW, N, NE" → arco atravessa o N (a1 > 360)', () => {
    expect(idealSector('NW, N, NE')).toEqual([303.75, 416.25]);
  });

  it('string vazia / sem cardeais → null', () => {
    expect(idealSector('')).toBeNull();
    expect(idealSector(null)).toBeNull();
    expect(idealSector(undefined)).toBeNull();
    // Spots de rio/lagoa não têm sector de mar.
    expect(idealSector('Rio')).toBeNull();
    expect(idealSector('Lagoa')).toBeNull();
  });
});

describe('inSector', () => {
  const nne = idealSector('NW, N, NE')!;
  it('dentro/fora com wrap no N', () => {
    expect(inSector(0, nne)).toBe(true);
    expect(inSector(315, nne)).toBe(true);
    expect(inSector(45, nne)).toBe(true);
    expect(inSector(90, nne)).toBe(false);
    expect(inSector(280, nne)).toBe(false);
  });
  it('sector null → false', () => {
    expect(inSector(0, null)).toBe(false);
  });
});

describe('cardinal16', () => {
  it('mapeia graus ao ponto cardeal mais próximo', () => {
    expect(cardinal16(0)).toBe('N');
    expect(cardinal16(358)).toBe('N');
    expect(cardinal16(337.4)).toBe('NNW');
    expect(cardinal16(90)).toBe('E');
    expect(cardinal16(225)).toBe('SW');
    expect(cardinal16(269)).toBe('W');
  });
});

describe('unwrapAngle', () => {
  it('359 → 1 roda +2 (continua para a frente)', () => {
    expect(unwrapAngle(359, 1)).toBe(361);
  });
  it('1 → 359 roda −2 (recua)', () => {
    expect(unwrapAngle(1, 359)).toBe(-1);
  });
  it('mantém-se enrolado entre mudanças consecutivas', () => {
    let a = unwrapAngle(0, 350);
    expect(a).toBe(-10);
    a = unwrapAngle(a, 10);
    expect(a).toBe(10); // -10 → 10 = +20, não −340
  });
});

describe('tideExtrema', () => {
  // Sinusoide conhecida: período 12.4 h, máximos a k≈3.1, 15.5, …
  const sine = Array.from({ length: 49 }, (_, k) => ({
    time: `2026-09-21T${String(k % 24).padStart(2, '0')}:00`,
    tideHeight: Math.sin((2 * Math.PI * k) / 12.4),
  }));

  it('encontra PM/BM interpoladas (índice fraccional + hora HH:MM)', () => {
    const ex = tideExtrema(sine);
    expect(ex.length).toBeGreaterThanOrEqual(6);
    // O primeiro PM da sinusoide cai no vértice a k≈3.1.
    const firstHigh = ex.find((e) => e.type === 'high')!;
    expect(firstHigh.index).toBeGreaterThan(2.5);
    expect(firstHigh.index).toBeLessThan(3.7);
    expect(firstHigh.height).toBeCloseTo(1, 1);
    expect(firstHigh.hhmm).toMatch(/^0[23]:\d{2}$/);
    // Tipos alternam.
    for (let i = 1; i < ex.length; i += 1) {
      expect(ex[i].type).not.toBe(ex[i - 1].type);
    }
  });

  it('série plana → sem extremos', () => {
    const flat = Array.from({ length: 10 }, (_, k) => ({
      time: `2026-09-21T${String(k).padStart(2, '0')}:00`,
      tideHeight: 0.5,
    }));
    expect(tideExtrema(flat)).toEqual([]);
  });

  it('série curta → sem extremos', () => {
    expect(tideExtrema([{ time: '2026-09-21T00:00', tideHeight: 0 }])).toEqual([]);
  });
});

describe('nextTideExtremum / tideDirectionAt', () => {
  const pts = [
    { time: '2026-09-21T00:00', tideHeight: -1 },
    { time: '2026-09-21T01:00', tideHeight: 0 },
    { time: '2026-09-21T02:00', tideHeight: 1 },
    { time: '2026-09-21T03:00', tideHeight: 0 },
    { time: '2026-09-21T04:00', tideHeight: -1 },
  ];
  it('próximo extremo depois de k', () => {
    const ex = tideExtrema(pts);
    // Série triangular: BM no limite 0, PM no vértice 2, BM no limite 4.
    expect(ex.map((e) => e.type)).toEqual(['low', 'high', 'low']);
    expect(nextTideExtremum(ex, 0)?.type).toBe('high');
    expect(nextTideExtremum(ex, 3)?.type).toBe('low');
    expect(nextTideExtremum(ex, 5)).toBeUndefined();
  });
  it('a encher / a vazar', () => {
    expect(tideDirectionAt(pts, 1)).toBe('rising');
    expect(tideDirectionAt(pts, 3)).toBe('falling');
  });
});
