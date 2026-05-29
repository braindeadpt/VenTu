import { describe, expect, it } from 'vitest';
import { calmLabel, heroStatusLine, onLabel, spotsOnLine, tierPhrase } from '@/lib/voice';

describe('voice', () => {
  it('uses inclusive PT copy instead of ON', () => {
    expect(onLabel(true)).toBe('a bombar');
    expect(onLabel(false)).toBe('firing');
    expect(spotsOnLine(3, true)).toBe('3 spots a bombar');
  });

  it('calmLabel returns mar de espelho in PT', () => {
    expect(calmLabel(true)).toBe('mar de espelho');
  });

  it('heroStatusLine switches between on and calm', () => {
    expect(heroStatusLine(2, true)).toContain('a bombar');
    expect(heroStatusLine(0, true)).toContain('mar de espelho');
  });

  it('tierPhrase maps score tiers to short phrases', () => {
    expect(tierPhrase(85, true)).toBe('dia épico');
    expect(tierPhrase(65, true)).toBe('dá uns sets fáceis');
    expect(tierPhrase(10, true)).toBe('flat');
  });
});
