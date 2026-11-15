import { describe, expect, it } from 'vitest';
import { getDefaultNewsRegion } from '../news';

const pt = { sourceRegion: 'pt' as const };
const intl = { sourceRegion: 'intl' as const };
const semRegiao = {}; // o filtro trata a ausência como 'intl' (news.ts:82)

describe('getDefaultNewsRegion', () => {
  it('pt com itens pt → Cena PT', () => {
    expect(getDefaultNewsRegion('pt', [intl, pt])).toBe('pt');
  });

  it('pt sem itens pt → Todas (em vez do estado vazio)', () => {
    expect(getDefaultNewsRegion('pt', [intl, intl])).toBe('all');
  });

  it('pt com feed vazio → Todas', () => {
    expect(getDefaultNewsRegion('pt', [])).toBe('all');
  });

  it('pt sem sourceRegion nenhum → Todas (ausência conta como intl)', () => {
    expect(getDefaultNewsRegion('pt', [semRegiao, semRegiao])).toBe('all');
  });

  it('en → Todas, mesmo com itens pt', () => {
    expect(getDefaultNewsRegion('en', [pt, intl])).toBe('all');
  });
});
