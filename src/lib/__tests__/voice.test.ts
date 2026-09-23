import { describe, expect, it } from 'vitest';
import { calmLabel, heroStatusLine, onLabel, spotsOnLine, tierPhrase } from '@/lib/voice';

describe('voice', () => {
  it('uses inclusive PT copy instead of ON', () => {
    expect(onLabel('pt')).toBe('a bombar');
    expect(onLabel('en')).toBe('firing');
    expect(spotsOnLine(3, 'pt')).toBe('3 spots a bombar');
  });

  it('calmLabel returns mar de espelho in PT', () => {
    expect(calmLabel('pt')).toBe('mar de espelho');
  });

  it('heroStatusLine switches between on and calm', () => {
    expect(heroStatusLine(2, 'pt')).toContain('a bombar');
    expect(heroStatusLine(0, 'pt')).toContain('mar de espelho');
  });

  it('tierPhrase maps score tiers to short phrases', () => {
    expect(tierPhrase(85, 'pt')).toBe('dia clássico');
    expect(tierPhrase(65, 'pt')).toBe('dá uns sets fáceis');
    expect(tierPhrase(45, 'pt')).toBe('mar limpo');
    expect(tierPhrase(10, 'pt')).toBe('flat');
  });
});
