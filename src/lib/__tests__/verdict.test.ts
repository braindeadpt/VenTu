import { describe, expect, it } from 'vitest';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { whyLine } from '@/lib/verdict/whyLine';
import { formatHourLabel, formatHourLong, formatDayShort } from '@/lib/verdict/formatHourLabel';
import { getScoreTierLabel } from '@/lib/sportScore';

describe('scoreBand — limites canónicos (80/60/40/20)', () => {
  it.each([
    [0, 'closed'],
    [19, 'closed'],
    [20, 'poor'],
    [39, 'poor'],
    [40, 'fair'],
    [59, 'fair'],
    [60, 'good'],
    [79, 'good'],
    [80, 'epic'],
    [100, 'epic'],
  ] as const)('score %i → banda %s', (score, key) => {
    expect(scoreBand(score).key).toBe(key);
  });

  it('labels batem certo com getScoreTierLabel (fonte canónica)', () => {
    for (const score of [0, 25, 45, 65, 90]) {
      const band = scoreBand(score);
      expect(band.labelPt).toBe(getScoreTierLabel(band.key, 'pt'));
      expect(band.labelEn).toBe(getScoreTierLabel(band.key, 'en'));
    }
  });

  it('clampa scores fora de 0–100', () => {
    expect(scoreBand(-5).key).toBe('closed');
    expect(scoreBand(140).key).toBe('epic');
  });
});

describe('whyLine — frase curta dos factores existentes', () => {
  it('junta até 3 factores com separador', () => {
    expect(
      whyLine(['1.4m ondas', 'Vento offshore', '12s período', 'extra'], 'pt'),
    ).toBe('1.4m ondas · Vento offshore · 12s período');
  });

  it('um único factor sai sem separador', () => {
    expect(whyLine(['Vento fraco'], 'en')).toBe('Vento fraco');
  });

  it('factores vazios → null (não inventa texto)', () => {
    expect(whyLine([], 'pt')).toBeNull();
    expect(whyLine([], 'en')).toBeNull();
  });

  it('ignora entradas vazias/whitespace', () => {
    expect(whyLine(['  ', '1.4m ondas', ''], 'pt')).toBe('1.4m ondas');
  });
});

describe('formatHourLabel — hora local do spot', () => {
  it('devolve HH:mm da hora Open-Meteo (wall time Europe/Lisbon)', () => {
    expect(formatHourLabel('2026-09-17T14:00', 'pt')).toBe('14:00');
    expect(formatHourLabel('2026-09-17T06:00', 'en')).toBe('06:00');
  });

  it('não depende do fuso da máquina de teste', () => {
    // A string já é wall-time de Lisboa — o label tem de ser estável em qualquer TZ.
    expect(formatHourLabel('2026-03-29T03:00', 'pt')).toBe('03:00');
  });
});

describe('formatHourLong — rótulo acessível da hora', () => {
  it('pt: dia da semana + dia + mês + hora', () => {
    // 2026-09-17 é quinta-feira.
    expect(formatHourLong('2026-09-17T12:00', 'pt')).toBe('qui 17 set, 12:00');
  });

  it('en: mesmo formato com partes en-GB', () => {
    expect(formatHourLong('2026-09-17T12:00', 'en')).toBe('Thu 17 Sept, 12:00');
  });

  it('estável ao mudar de mês/dia', () => {
    expect(formatHourLong('2026-10-01T00:00', 'pt')).toBe('qui 1 out, 00:00');
  });
});

describe('formatDayShort — marcador de dia na régua', () => {
  it('pt: weekday 3 letras + dia', () => {
    expect(formatDayShort('2026-09-17T12:00', 'pt')).toBe('qui 17');
    expect(formatDayShort('2026-09-18T00:00', 'pt')).toBe('sex 18');
  });

  it('en: weekday curto + dia', () => {
    expect(formatDayShort('2026-09-17T12:00', 'en')).toBe('Thu 17');
  });
});
