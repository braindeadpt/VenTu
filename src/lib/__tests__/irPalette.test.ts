/** irPalette — realce Infra+ (topos de nuvens frios). LUT pura, testável
 *  em Node sem DOM. */
import { describe, it, expect } from 'vitest';
import {
  applyIrPalette,
  irPaletteColorFor,
  IR_BRIGHT_COLD_MIN,
  IR_BRIGHT_COLD_MAX,
} from '@/lib/irPalette';

function rgba(px: Array<[number, number, number]>, alpha: number[] = []): Uint8ClampedArray {
  const data = new Uint8ClampedArray(px.length * 4);
  px.forEach(([r, g, b], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = alpha[i] ?? 255;
  });
  return data;
}

describe('irPalette — banda fria colorida', () => {
  it('brilho na banda fria (>=150) recebe cor, pixel quente fica intacto', () => {
    const coldTop = rgba([[255, 255, 255]]); // topo muito frio
    const coldMid = rgba([[180, 180, 180]]); // nuvem média
    const warm = rgba([[60, 60, 60]]); // mar/solo
    expect(applyIrPalette(coldTop)).toBe(1);
    expect(applyIrPalette(coldMid)).toBe(1);
    expect(applyIrPalette(warm)).toBe(0);
    // quente intacto
    expect([warm[0], warm[1], warm[2]]).toEqual([60, 60, 60]);
    // frio colorido: já não é grayscale
    expect(coldTop[0]).not.toBe(coldTop[1]);
  });

  it('alpha 0 (sem dados) nunca é colorido', () => {
    const data = rgba([[255, 255, 255], [255, 255, 255]], [0, 255]);
    expect(applyIrPalette(data)).toBe(1);
  });

  it('gradiente perceptivo: azul (moderado) → vermelho (severo)', () => {
    const moderate = irPaletteColorFor(IR_BRIGHT_COLD_MIN)!;
    const severe = irPaletteColorFor(IR_BRIGHT_COLD_MAX)!;
    // moderado: dominante azul (b > r)
    expect(moderate[2]).toBeGreaterThan(moderate[0]);
    // severo: dominante vermelho (r > b)
    expect(severe[0]).toBeGreaterThan(severe[2]);
  });

  it('todas as cores da LUT são válidas e o vermelho domina no topo severo', () => {
    // O gradiente não é monotónico em r (ciano/verde a meio têm r baixo) —
    // a invariant real é: extremos com vermelho dominante vs azul moderado.
    for (let b = IR_BRIGHT_COLD_MIN; b <= IR_BRIGHT_COLD_MAX; b += 8) {
      const c = irPaletteColorFor(b)!;
      expect(c).toHaveLength(3);
      for (const v of c) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of c) expect(v).toBeLessThanOrEqual(255);
    }
    const severe = irPaletteColorFor(IR_BRIGHT_COLD_MAX)!;
    expect(severe[0]).toBeGreaterThan(200); // vermelho dominante no topo
  });

  it('fora da banda → null (não colorir)', () => {
    expect(irPaletteColorFor(0)).toBeNull();
    expect(irPaletteColorFor(IR_BRIGHT_COLD_MIN - 1)).toBeNull();
    expect(irPaletteColorFor(149)).toBeNull();
  });
});
