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
    expect(heroStatusLine(0, 'pt')).toBe('Mar de espelho — vê o mapa na mesma');
  });

  it('heroStatusLine não diz «mar de espelho» quando há janela boa mais logo', () => {
    const line = heroStatusLine(0, 'pt', { goodWindowLater: true });
    expect(line).not.toContain('mar de espelho');
    expect(line).toBe('Nada a bombar agora — há janela boa mais logo');
    // Spots a bombar agora têm prioridade sobre a janela futura.
    expect(heroStatusLine(3, 'pt', { goodWindowLater: true })).toBe('3 spots a bombar');
  });

  it('tierPhrase maps score tiers to short phrases', () => {
    expect(tierPhrase(85, 'pt')).toBe('dia clássico');
    expect(tierPhrase(65, 'pt')).toBe('dá uns sets fáceis');
    expect(tierPhrase(45, 'pt')).toBe('mar limpo');
    expect(tierPhrase(10, 'pt')).toBe('flat');
  });
});
