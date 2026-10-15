/**
 * Câmara da praia em 3D: no telemóvel o spot fica no centro do enquadramento
 * (a página abria com o Guincho ~20 px ao lado e acima do centro a 390 px);
 * no desktop continua centrada um pouco ao largo, como na maquete.
 */
import { describe, expect, it } from 'vitest';
import { camara, desloca } from '../praiaCena';

const LL: [number, number] = [-9.4728, 38.7347];
const ROTULO: [number, number] = [-9.4712, 38.733];

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
});
