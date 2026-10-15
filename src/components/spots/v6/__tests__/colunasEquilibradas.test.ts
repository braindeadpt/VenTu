import { describe, expect, it } from 'vitest';
import { distribuir } from '../colunasEquilibradas';

describe('distribuir (colunas do «O que se mede»)', () => {
  it('1440, alturas reais da ronda 3: a coluna mais alta desce de 510 para 464 px', () => {
    // boia, sol e ar, maré e lua, fundo, clima
    const { coluna, alturas } = distribuir([194, 145, 436, 307, 191], 3, 12);
    expect(Math.max(...alturas)).toBe(464);
    expect(new Set(coluna).size).toBe(3);
    // a 1.ª coluna começa pelo 1.º cartão (ordem de leitura)
    expect(coluna[0]).toBe(0);
  });

  it('todas as colunas recebem cartões e a ordem do DOM mantém-se dentro de cada coluna', () => {
    const { coluna } = distribuir([100, 100, 100, 100], 2, 12);
    expect(coluna.filter((c) => c === 0).length).toBe(2);
    expect(coluna.filter((c) => c === 1).length).toBe(2);
  });

  it('menos cartões do que colunas: uma coluna por cartão', () => {
    const { coluna, alturas } = distribuir([200, 80], 3, 12);
    expect(coluna).toEqual([0, 1]);
    expect(alturas).toEqual([200, 80]);
  });

  it('o gap só entra entre cartões da mesma coluna', () => {
    const { alturas } = distribuir([50, 50, 50], 1, 12);
    expect(alturas).toEqual([174]);
  });

  it('mais de 8 cartões: guloso, sem colunas vazias', () => {
    const hs = [120, 80, 200, 60, 90, 150, 70, 110, 95, 130];
    const { coluna, alturas } = distribuir(hs, 3, 12);
    expect(coluna).toHaveLength(hs.length);
    expect(alturas.every((h) => h > 0)).toBe(true);
  });
});
