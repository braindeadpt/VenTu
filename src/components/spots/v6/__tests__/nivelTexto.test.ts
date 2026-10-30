/** #nivel-ui — «Nível» no «Chegar e estar»: por modalidade quando difere; «por confirmar» quando falta. */
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import { nivelTexto } from '../SpotContextoV6';
import type { Spot } from '@/types';

const guincho = spots.find((s) => s.id === 'guincho')!;
const nazare = spots.find((s) => s.id === 'nazare')!;

describe('nivelTexto', () => {
  it('Guincho: avançado em kite, intermédio em surf (nas duas modalidades da página)', () => {
    expect(nivelTexto(guincho, 'kitesurf', 'pt')).toBe('avançado em kite, intermédio em surf');
    expect(nivelTexto(guincho, 'surf', 'pt')).toBe('avançado em kite, intermédio em surf');
    expect(nivelTexto(guincho, 'kitesurf', 'en')).toBe('advanced for kite, intermediate for surf');
  });
  it('um só nível: o rótulo de sempre', () => {
    expect(nivelTexto(nazare, 'surf', 'pt')).toBe('Expert');
  });
  it('sem nível na ficha: «por confirmar»', () => {
    const sem = { ...guincho, difficulty: undefined, difficultyBySport: undefined } as unknown as Spot;
    expect(nivelTexto(sem, 'surf', 'pt')).toBe('por confirmar');
    expect(nivelTexto({ ...sem, difficulty: 'xyz' } as unknown as Spot, 'surf', 'fr')).toBe('à confirmer');
  });
});
