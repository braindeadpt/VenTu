/**
 * Câmara da praia em 3D: no telemóvel o spot fica no centro do enquadramento
 * (a página abria com o Guincho ~20 px ao lado e acima do centro a 390 px);
 * no desktop continua centrada um pouco ao largo, como na maquete.
 */
import { describe, expect, it } from 'vitest';
import {
  anguloSetaVento,
  camara,
  desloca,
  frentesOnda,
  isobatasNoRectangulo,
  rotuloCurtoVizinho,
  sportParaMapa,
} from '../praiaCena';

const LL: [number, number] = [-9.4728, 38.7347];
const ROTULO: [number, number] = [-9.4712, 38.733];

/** Teste de interseção 2D entre os segmentos fechados AB e CD. */
function segmentosIntersectam(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const cross = (o: [number, number], p: [number, number], q: [number, number]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const noCaixa = (p: [number, number], q: [number, number], r: [number, number]) =>
    r[0] >= Math.min(p[0], q[0]) - 1e-12 &&
    r[0] <= Math.max(p[0], q[0]) + 1e-12 &&
    r[1] >= Math.min(p[1], q[1]) - 1e-12 &&
    r[1] <= Math.max(p[1], q[1]) + 1e-12;

  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < 1e-12 && noCaixa(a, b, c)) return true;
  if (Math.abs(d2) < 1e-12 && noCaixa(a, b, d)) return true;
  if (Math.abs(d3) < 1e-12 && noCaixa(c, d, a)) return true;
  if (Math.abs(d4) < 1e-12 && noCaixa(c, d, b)) return true;
  return false;
}

describe('camara', () => {
  it('telemóvel: centrada no spot', () => {
    const c = camara(LL, 280, false);
    expect(c.center).toEqual(LL);
    expect(c.zoom).toBe(12.6);
    expect(c.pitch).toBe(60);
    expect(c.bearing).toBe(72);
  });
  it('telemóvel: centrada no ponto do rótulo editorial quando há um', () => {
    expect(camara(LL, 280, false, ROTULO).center).toEqual(ROTULO);
  });
  it('desktop: sem mudança (0,75 km ao largo, o foco não conta)', () => {
    const c = camara(LL, 280, true, ROTULO);
    expect(c.center).toEqual(desloca(LL, 280, 0.75));
    expect(c.zoom).toBe(13.25);
    expect(c.bearing).toBe(72);
  });
  it('aguaInterior = true: centrada no spot mesmo em desktop, bearing 0 e pitch 55', () => {
    const cDesktop = camara(LL, 280, true, undefined, true);
    expect(cDesktop.center).toEqual(LL);
    expect(cDesktop.bearing).toBe(0);
    expect(cDesktop.pitch).toBe(55);
    expect(cDesktop.zoom).toBe(13.0);

    const cDesktopFoco = camara(LL, 280, true, ROTULO, true);
    expect(cDesktopFoco.center).toEqual(ROTULO);
    expect(cDesktopFoco.bearing).toBe(0);
    expect(cDesktopFoco.pitch).toBe(55);

    const cMobile = camara(LL, 280, false, undefined, true);
    expect(cMobile.center).toEqual(LL);
    expect(cMobile.bearing).toBe(0);
    expect(cMobile.pitch).toBe(55);
    expect(cMobile.zoom).toBe(12.4);
  });
});

describe('anguloSetaVento', () => {
  it('com bearing = 0, devolve wd normalizado em [0, 359]', () => {
    expect(anguloSetaVento(0, 0)).toBeCloseTo(0, 6);
    expect(anguloSetaVento(180, 0)).toBeCloseTo(180, 6);
    expect(anguloSetaVento(359, 0)).toBeCloseTo(359, 6);
    expect(anguloSetaVento(360, 0)).toBeCloseTo(0, 6);
    expect(anguloSetaVento(450, 0)).toBeCloseTo(90, 6);
    expect(anguloSetaVento(-10, 0)).toBeCloseTo(350, 6);
  });

  it('no Guincho (bearing = 72, wd = 340 NNW) devolve 268', () => {
    expect(anguloSetaVento(340, 72)).toBeCloseTo(268, 6);
  });

  it('em wrap-around negativo (wd = 45, bearing = 72) devolve 333', () => {
    expect(anguloSetaVento(45, 72)).toBeCloseTo(333, 6);
  });

  it('em vista 3D inclinada (pitch = 60), comprime o eixo vertical por cos(pitch)', () => {
    // vento direto no eixo da câmara → 0°
    expect(anguloSetaVento(72, 72, 60)).toBeCloseTo(0, 6);
    // vento transversal → 90°
    expect(anguloSetaVento(162, 72, 60)).toBeCloseTo(90, 6);
    // vento oblíquo a 45° do eixo da câmara: cos(60°) = 0.5 → atan2(sin(45°), cos(45°)*0.5) ≈ 63.435°
    const obliquo = anguloSetaVento(117, 72, 60);
    const esperado = (Math.atan2(Math.sin(Math.PI / 4), Math.cos(Math.PI / 4) * 0.5) * 180) / Math.PI;
    expect(obliquo).toBeGreaterThan(45);
    expect(obliquo).toBeCloseTo(esperado, 6);
    expect(obliquo).toBeCloseTo(63.435, 3);
  });
});

describe('rotuloCurtoVizinho', () => {
  it('remove sufixo de região entre parênteses', () => {
    expect(rotuloCurtoVizinho('São Lourenço (Ericeira)')).toBe('São Lourenço');
    expect(rotuloCurtoVizinho('Crazy Left (Ericeira)')).toBe('Crazy Left');
  });

  it('mantém nomes sem parênteses intactos', () => {
    expect(rotuloCurtoVizinho("Ribeira d'Ilhas")).toBe("Ribeira d'Ilhas");
  });

  it('mantém intacto se remover deixar menos de 3 caracteres', () => {
    expect(rotuloCurtoVizinho('A (B)')).toBe('A (B)');
    expect(rotuloCurtoVizinho('AB (C)')).toBe('AB (C)');
  });
});

describe('sportParaMapa', () => {
  it('mantém a modalidade ativa quando compatível com o spot', () => {
    expect(sportParaMapa(['surf', 'kitesurf'], 'kite')).toBe('kitesurf');
    expect(sportParaMapa(['surf', 'kitesurf'], 'surf')).toBe('surf');
  });

  it('usa a primeira modalidade compatível quando o spot não suporta surf nem kite (ex.: Alqueva, Castelo de Bode)', () => {
    expect(sportParaMapa(['wakeboard'], 'surf')).toBe('wakeboard');
    expect(sportParaMapa(['wakeboard'], 'kite')).toBe('wakeboard');
    expect(sportParaMapa(['wakeboard', 'sup'], 'surf')).toBe('wakeboard');
    expect(sportParaMapa(['foil'], 'surf')).toBe('foil');
  });

  it('cai para all quando não há lista de modalidades', () => {
    expect(sportParaMapa(undefined, 'surf')).toBe('all');
    expect(sportParaMapa([], 'kite')).toBe('all');
  });
});

describe('frentesOnda', () => {
  it('devolve [] quando hs <= 0.15 ou tp <= 0', () => {
    expect(frentesOnda(LL, 280, 280, 10, 0.15, 0)).toEqual([]);
    expect(frentesOnda(LL, 280, 280, 10, 0.1, 0)).toEqual([]);
    expect(frentesOnda(LL, 280, 280, 10, 0, 0)).toEqual([]);
    expect(frentesOnda(LL, 280, 280, 0, 2, 0)).toEqual([]);
    expect(frentesOnda(LL, 280, 280, -4, 2, 0)).toEqual([]);
  });

  it('com ondulação fortemente oblíqua (sd = praiaVirada ± 70, tp = 6, hs = 2), frentes consecutivas nunca se intersectam', () => {
    const praiaVirada = 280;
    for (const sd of [praiaVirada + 70, praiaVirada - 70]) {
      for (const t of [0, 1.5, 4.2]) {
        const frentes = frentesOnda(LL, praiaVirada, sd, 6, 2, t);
        expect(frentes.length).toBeGreaterThanOrEqual(2);
        let intersecoes = 0;
        for (let k = 0; k < frentes.length - 1; k++) {
          const f1 = frentes[k];
          const f2 = frentes[k + 1];
          expect(f1.length).toBeGreaterThanOrEqual(2);
          expect(f2.length).toBeGreaterThanOrEqual(2);
          for (let i = 0; i < f1.length - 1; i++) {
            for (let j = 0; j < f2.length - 1; j++) {
              if (segmentosIntersectam(f1[i], f1[i + 1], f2[j], f2[j + 1])) intersecoes++;
            }
          }
        }
        expect(intersecoes).toBe(0);
      }
    }
  });
});

describe('isobatasNoRectangulo', () => {
  const proj = ([x, y]: [number, number]) => ({ x, y });

  it('exclui linha totalmente fora do retângulo [0, 390] × [0, 420] (cenário Baía do Seixal)', () => {
    const grupos = [
      {
        depth: 10,
        lines: [
          [
            [-400, 100],
            [-350, 200],
          ],
        ],
      },
    ];
    expect(isobatasNoRectangulo(grupos, proj, 390, 420)).toEqual([]);
  });

  it('mantém linha que atravessa o retângulo com ambos os extremos fora', () => {
    const grupos = [
      {
        depth: 15,
        lines: [
          [
            [-50, 200],
            [450, 210],
          ],
        ],
      },
    ];
    expect(isobatasNoRectangulo(grupos, proj, 390, 420)).toEqual(grupos);
  });

  it('devolve [] quando o retângulo é vazio (w = 0 ou h = 0)', () => {
    const grupos = [
      {
        depth: 8,
        lines: [
          [
            [50, 50],
            [150, 150],
          ],
        ],
      },
    ];
    expect(isobatasNoRectangulo(grupos, proj, 0, 420)).toEqual([]);
    expect(isobatasNoRectangulo(grupos, proj, 390, 0)).toEqual([]);
    expect(isobatasNoRectangulo(grupos, proj, 0, 0)).toEqual([]);
  });

  it('filtra seletivamente mantendo apenas os grupos com segmentos no retângulo', () => {
    const dentro = {
      depth: 8,
      lines: [
        [
          [100, 100],
          [200, 180],
        ],
      ],
    };
    const fora = {
      depth: 30,
      lines: [
        [
          [-400, 100],
          [-350, 200],
        ],
      ],
    };
    const resultado = isobatasNoRectangulo([dentro, fora], proj, 390, 420);
    expect(resultado).toEqual([dentro]);
    expect(resultado.map((g) => g.depth)).toEqual([8]);
  });
});
