import { describe, it, expect } from 'vitest';
import { formatBestWindowHours } from '@/lib/bestWindow';

describe('formatBestWindowHours', () => {
  it('janela no mesmo dia — sem sufixo', () => {
    expect(formatBestWindowHours({ start: 10, end: 14 })).toBe('10h–14h');
    expect(formatBestWindowHours({ start: 8, end: 9 }, 'pt')).toBe('08h–09h');
  });

  it('janela overnight (end < start) leva sufixo amanhã/tomorrow', () => {
    expect(formatBestWindowHours({ start: 23, end: 7 }, 'pt')).toBe('23h–07h (amanhã)');
    expect(formatBestWindowHours({ start: 23, end: 7 }, 'en')).toBe('23h–07h (tomorrow)');
    // Locale desconhecido → fallback EN (consistente com o resto do produto).
    expect(formatBestWindowHours({ start: 22, end: 5 }, 'de')).toBe('22h–05h (tomorrow)');
  });

  it('janela degenerada (end == start) não diz amanhã', () => {
    expect(formatBestWindowHours({ start: 0, end: 0 }, 'pt')).toBe('00h–00h');
  });
});
