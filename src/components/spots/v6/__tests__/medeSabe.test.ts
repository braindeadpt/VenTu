import { describe, expect, it } from 'vitest';
import { luaAcesa } from '../MedeSabeV6';

describe('luaAcesa (disco da lua do «Maré e lua» v6)', () => {
  it('nova → nada aceso; cheia → o disco inteiro', () => {
    expect(luaAcesa(24, 24, 21, 0, true)).toBe('');
    expect(luaAcesa(24, 24, 21, 1, true)).toBe('M3 24A21 21 0 1 0 45 24A21 21 0 1 0 3 24Z');
  });

  it('quarto: o terminador é uma recta (raio horizontal 0)', () => {
    expect(luaAcesa(24, 24, 21, 0.5, true)).toBe('M24 3A21 21 0 0 1 24 45A0 21 0 0 1 24 3Z');
  });

  it('a crescer acende a direita; a minguar acende a esquerda', () => {
    // crescente fina: semicírculo direito (sweep 1) fechado por um terminador que volta pela direita (sweep 0)
    expect(luaAcesa(24, 24, 21, 0.2, true)).toBe('M24 3A21 21 0 0 1 24 45A12.6 21 0 0 0 24 3Z');
    // minguante fina: semicírculo esquerdo (sweep 0), terminador pela esquerda (sweep 1)
    expect(luaAcesa(24, 24, 21, 0.2, false)).toBe('M24 3A21 21 0 0 0 24 45A12.6 21 0 0 1 24 3Z');
    // gibosa crescente: o terminador passa para o lado escuro (sweep 1)
    expect(luaAcesa(24, 24, 21, 0.8, true)).toBe('M24 3A21 21 0 0 1 24 45A12.6 21 0 0 1 24 3Z');
  });
});
