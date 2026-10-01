import { describe, it, expect } from 'vitest';
import {
  SAME_BOX_PLACEHOLDER,
  ensembleCardLine,
} from '../ensembleCardLine';
import type { EnsembleFamily } from '../ensembleBand';

const waveBand = (over: Partial<EnsembleFamily> = {}): EnsembleFamily => ({
  p10: 1.0,
  p50: 1.7,
  p90: 1.9,
  n: 4,
  ...over,
});

describe('ensembleCardLine (slot secundário do cartão Onda)', () => {
  it('com banda na hora, o slot mostra a banda', () => {
    expect(ensembleCardLine({ band: waveBand() })).toEqual({
      kind: 'band',
      p10: 1.0,
      p90: 1.9,
      n: 4,
    });
  });

  it('sem banda, o slot mantém o mar de fundo (não fica vazio nem cresce)', () => {
    expect(ensembleCardLine({ band: null, swellHeightM: 1.3, swellPeriodS: 9 })).toEqual({
      kind: 'swell',
      heightM: 1.3,
      periodS: 9,
    });
  });

  it('degradação: sem banda e sem mar de fundo o slot fica «blank» (placeholder)', () => {
    expect(ensembleCardLine({})).toEqual({ kind: 'blank' });
    expect(ensembleCardLine({ band: null, swellHeightM: 1.3 })).toEqual({ kind: 'blank' });
    expect(ensembleCardLine({ band: null, swellPeriodS: 9 })).toEqual({ kind: 'blank' });
  });

  it('família com menos membros que o produtor cai para o mar de fundo', () => {
    expect(
      ensembleCardLine({
        band: waveBand({ n: 2 }),
        swellHeightM: 1.3,
        swellPeriodS: 9,
      }),
    ).toEqual({ kind: 'swell', heightM: 1.3, periodS: 9 });
  });

  it('quantil não finito não vira banda na cara do utilizador', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(ensembleCardLine({ band: waveBand({ p10: bad }) }).kind).toBe('blank');
      expect(ensembleCardLine({ band: waveBand({ p90: bad }) }).kind).toBe('blank');
    }
  });

  it('não inteiro (contagem corrompida) não vira banda', () => {
    expect(ensembleCardLine({ band: waveBand({ n: 4.5 }) }).kind).toBe('blank');
  });

  it('o placeholder é NBSP — um espaço normal colapsaria a linha (regressão do f2508ce66)', () => {
    expect(SAME_BOX_PLACEHOLDER).toBe('\u00A0');
    expect(SAME_BOX_PLACEHOLDER).not.toBe(' ');
    expect(SAME_BOX_PLACEHOLDER.trim()).toBe('');
  });
});
