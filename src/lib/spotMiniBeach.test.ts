import { describe, it, expect } from 'vitest';
import {
  BEACH_W,
  BEACH_H,
  beachGeometry,
  arrowTransform,
  sunPos,
  moonPos,
  dayNight,
  norm360,
  compassVec,
} from './spotMiniBeach';

/** Todos os números de um «d»/«points»/transform SVG são finitos. */
const NUM_RE = /-?\d+(\.\d+)?/g;
const svgNums = (s: string): number[] =>
  (s.match(NUM_RE) ?? []).map(Number);

const allFinite = (s: string) => svgNums(s).every(Number.isFinite);
const noNaN = (s: string) => !/NaN|undefined|Infinity/.test(s);

describe('spotMiniBeach — beachGeometry', () => {
  // Os 5 spots de referência da #184 com os valores ACTUAIS de
  // coastOrientation em spots.ts (270=W hoje; a #178 corrige Carcavelos e
  // Supertubos — os restantes são cobertura extra de ângulos variados).
  const REF_SPOTS: Array<[string, number]> = [
    ['Carcavelos', 270],
    ['Supertubos', 270],
    ['Guincho', 270],
    ['Nazaré', 270],
    ["Ribeira d'Ilhas", 270],
    ['cobertura E', 90],
    ['cobertura S', 180],
    ['cobertura N', 0],
  ];

  it.each(REF_SPOTS)('geometria finita e dentro do viewBox — %s', (_name, coast) => {
    const g = beachGeometry(coast);
    for (const s of [
      g.landPoints,
      g.seaPoints,
      g.coastPath,
      g.fan.onshore,
      g.fan.crossNear,
      g.fan.crossFar,
    ]) {
      expect(noNaN(s)).toBe(true);
      expect(allFinite(s)).toBe(true);
    }
    expect(Number.isFinite(g.anchor.x)).toBe(true);
    expect(Number.isFinite(g.anchor.y)).toBe(true);
  });

  it('aceita ângulos fora de [0,360) e inputs inválidos sem NaN', () => {
    for (const coast of [0, 90, 270, 360, -45, 725, NaN, Infinity]) {
      const g = beachGeometry(coast);
      expect(noNaN(g.coastPath)).toBe(true);
      expect(noNaN(g.seaPoints)).toBe(true);
      expect(noNaN(g.fan.onshore)).toBe(true);
    }
  });

  it('a terra fica no lado oposto ao mar (facing)', () => {
    // Costa a O (270°): o mar deve estar à esquerda do centro.
    const g = beachGeometry(270);
    const seaAvg =
      g.seaPoints
        .split(' ')
        .reduce<number[]>((a, _v, i, arr) => (i % 2 ? a : [...a, Number(arr[i])]), [])
        .reduce((a, b) => a + b, 0) /
      (g.seaPoints.split(' ').length / 2);
    expect(seaAvg).toBeLessThan(BEACH_W / 2);
  });
});

describe('spotMiniBeach — setas', () => {
  it('arrowTransform produz translate+rotate finitos', () => {
    const t = arrowTransform({ x: 50, y: 60 }, 135);
    expect(t).toMatch(/^translate\(50 60\) rotate\(45\)$/);
    expect(noNaN(arrowTransform({ x: NaN, y: 0 }, 90))).toBe(true);
  });

  it('compassVec mapeia bússola → eixos SVG (0°=N=cima, 90°=E)', () => {
    expect(compassVec(0).y).toBeCloseTo(-1);
    expect(compassVec(90).x).toBeCloseTo(1);
    expect(compassVec(180).y).toBeCloseTo(1);
    expect(compassVec(270).x).toBeCloseTo(-1);
  });
});

describe('spotMiniBeach — sol, lua e noite', () => {
  it('sunPos atravessa o arco esquerda→direita e recusa frações fora de [0,1]', () => {
    const rise = sunPos(0)!;
    const noon = sunPos(0.5)!;
    const set = sunPos(1)!;
    expect(rise.x).toBeLessThan(noon.x);
    expect(noon.x).toBeLessThan(set.x);
    expect(noon.y).toBeLessThan(rise.y); // meio-dia = arco mais alto
    expect(sunPos(-0.1)).toBeNull();
    expect(sunPos(1.1)).toBeNull();
    expect(sunPos(NaN)).toBeNull();
  });

  it('moonPos nunca devolve NaN', () => {
    for (const f of [0, 0.5, 1, NaN, -3, 7]) {
      const p = moonPos(f);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it('dayNight classifica dia/noite e as frações ficam em [0,1]', () => {
    const day = dayNight({
      hourIso: '2026-10-13T14:00',
      sunriseMin: 465, // 07:45
      sunsetMin: 1158, // 19:18
    });
    expect(day.isNight).toBe(false);
    expect(day.dayFrac).toBeGreaterThan(0);
    expect(day.dayFrac).toBeLessThan(1);

    const night = dayNight({
      hourIso: '2026-10-13T23:30',
      sunriseMin: 465,
      sunsetMin: 1158,
    });
    expect(night.isNight).toBe(true);
    expect(night.nightFrac).toBeGreaterThanOrEqual(0);
    expect(night.nightFrac).toBeLessThanOrEqual(1);

    const preDawn = dayNight({
      hourIso: '2026-10-13T05:00',
      sunriseMin: 465,
      sunsetMin: 1158,
    });
    expect(preDawn.isNight).toBe(true);
  });

  it('dayNight sem dados solares assume dia (sem véu nem NaN)', () => {
    expect(dayNight({ hourIso: '2026-10-13T02:00' }).isNight).toBe(false);
    expect(dayNight({ hourIso: undefined }).isNight).toBe(false);
  });
});

describe('spotMiniBeach — helpers', () => {
  it('norm360 normaliza ângulos', () => {
    expect(norm360(370)).toBe(10);
    expect(norm360(-10)).toBe(350);
    expect(norm360(720)).toBe(0);
  });
});
