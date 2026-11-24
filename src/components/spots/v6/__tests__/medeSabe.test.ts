import { describe, expect, it } from 'vitest';
import { instanteMedida, luaAcesa } from '../MedeSabeV6';

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

describe('instanteMedida (tooltip da corrente — hora do spot, não UTC cru)', () => {
  it('Lisboa: converte o ISO UTC para a hora de parede com abreviatura de fuso', () => {
    // 14:32Z → 15:32 em Lisboa no verão (WEST, UTC+1); 14:32 no inverno (WET, UTC+0)
    const verao = instanteMedida('2026-07-15T14:32:00Z', 'pt', 'Europe/Lisbon');
    expect(verao).toMatch(/^15:32\s+\S/);
    const inverno = instanteMedida('2026-01-15T14:32:00Z', 'pt', 'Europe/Lisbon');
    expect(inverno).toMatch(/^14:32\s+\S/);
    // Nunca o carimbo cru: sem data ISO, sem segundos, sem «Z» solto.
    for (const s of [verao, inverno]) {
      expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(s).not.toMatch(/:\d{2}:\d{2}/);
      expect(s).not.toMatch(/Z$/);
    }
  });

  it('Açores (fuso do spot): 1 h atrás de Lisboa no verão', () => {
    // 14:32Z → 14:32 nos Açores no verão (AZOST, UTC+0) — não 15:32 de Lisboa.
    expect(instanteMedida('2026-07-15T14:32:00Z', 'pt', 'Atlantic/Azores')).toMatch(/^14:32\s+\S/);
  });

  it('locale inválido cai em pt; ISO inválido devolve null', () => {
    expect(instanteMedida('2026-07-15T14:32:00Z', 'xx', 'Europe/Lisbon')).toMatch(/^15:32\s+\S/);
    expect(instanteMedida('ontem às tantas', 'pt', 'Europe/Lisbon')).toBeNull();
  });
});
