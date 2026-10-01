import { describe, expect, it } from 'vitest';
import { exploreFitPadding, resolveExploreChrome } from '../mapMarkers';

describe('resolveExploreChrome', () => {
  it('sem modo Explorar em ecrã inteiro não há moldura', () => {
    expect(resolveExploreChrome(false, true, false)).toBe('none');
    expect(resolveExploreChrome(false, false, true)).toBe('none');
  });

  it('mobile tem o sheet; desktop o painel aberto ou o rail', () => {
    expect(resolveExploreChrome(true, true, false)).toBe('sheet');
    expect(resolveExploreChrome(true, false, false)).toBe('panel-open');
    expect(resolveExploreChrome(true, false, true)).toBe('panel-rail');
  });
});

describe('exploreFitPadding', () => {
  it('o sheet reserva o estado fechado no fundo (não os 190 px do HUD antigo)', () => {
    const pad = exploreFitPadding('sheet', true);
    expect(pad.bottomRight[1]).toBeGreaterThanOrEqual(8 + 220);
    expect(pad.westShift).toBe(false);
  });

  it('o painel aberto reserva a esquerda e desliga o desvio para oeste', () => {
    const pad = exploreFitPadding('panel-open', false);
    // inset 8 px + largura 360 px do MapSpotPanel (§5)
    expect(pad.topLeft[0]).toBeGreaterThanOrEqual(8 + 360);
    // o desvio empurrava a costa para debaixo do painel
    expect(pad.westShift).toBe(false);
  });

  it('o rail recolhido reserva só a sua largura e mantém o desvio', () => {
    const pad = exploreFitPadding('panel-rail', false);
    expect(pad.topLeft[0]).toBeGreaterThanOrEqual(8 + 56);
    expect(pad.topLeft[0]).toBeLessThan(8 + 360);
    expect(pad.westShift).toBe(true);
  });

  it('os mapas embebidos mantêm as margens de antes', () => {
    expect(exploreFitPadding('none', true)).toEqual({ topLeft: [16, 16], bottomRight: [16, 190], westShift: false });
    expect(exploreFitPadding('none', false)).toEqual({ topLeft: [40, 48], bottomRight: [40, 110], westShift: true });
  });
});
