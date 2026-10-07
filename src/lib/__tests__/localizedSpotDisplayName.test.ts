import { describe, it, expect } from 'vitest';
import { localizedSpotDisplayName } from '@/lib/localizedSpotText';

describe('localizedSpotDisplayName', () => {
  it('prefere o nome acentuado quando o nameEn é só a cópia sem acentos', () => {
    expect(localizedSpotDisplayName({ name: 'Nazaré', nameEn: 'Nazare' }, 'en')).toBe('Nazaré');
    expect(localizedSpotDisplayName({ name: 'Vila Praia de Âncora', nameEn: 'Vila Praia de Ancora' }, 'fr')).toBe(
      'Vila Praia de Âncora',
    );
  });

  it('mantém traduções reais', () => {
    expect(localizedSpotDisplayName({ name: 'Afife (Praia da Arda)', nameEn: 'Afife (Arda Beach)' }, 'en')).toBe(
      'Afife (Arda Beach)',
    );
  });

  it('PT usa sempre o nome PT', () => {
    expect(localizedSpotDisplayName({ name: 'Nazaré', nameEn: 'Nazare' }, 'pt')).toBe('Nazaré');
  });
});
