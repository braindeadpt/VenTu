import { describe, expect, it } from 'vitest';
import {
  columnToTimelineIndex,
  formatDayLong,
  groupForecastDays,
  timelineIndexToColumn,
} from '@/lib/forecastTimeline';

/**
 * Mapeamento timeline ↔ coluna visível da ForecastTable (S3). A tabela
 * colapsada mostra só 36/48 h das 168 h do eixo — o índice escolhido pode
 * cair fora das colunas renderizadas.
 */
describe('timelineIndexToColumn', () => {
  it('tabela completa: índice = coluna', () => {
    expect(timelineIndexToColumn(0, 0, 168)).toBe(0);
    expect(timelineIndexToColumn(47, 0, 168)).toBe(47);
    expect(timelineIndexToColumn(167, 0, 168)).toBe(167);
  });

  it('tabela colapsada: índice fora das colunas visíveis → null', () => {
    // Colapsada no desktop: 48 colunas a partir de 0.
    expect(timelineIndexToColumn(47, 0, 48)).toBe(47);
    expect(timelineIndexToColumn(48, 0, 48)).toBeNull();
    expect(timelineIndexToColumn(120, 0, 48)).toBeNull();
  });

  it('janela fatiada (startTime): desloca o início visível', () => {
    // startIndex 24, 24 colunas visíveis → índices 24..47.
    expect(timelineIndexToColumn(24, 24, 24)).toBe(0);
    expect(timelineIndexToColumn(30, 24, 24)).toBe(6);
    expect(timelineIndexToColumn(47, 24, 24)).toBe(23);
    expect(timelineIndexToColumn(23, 24, 24)).toBeNull();
    expect(timelineIndexToColumn(48, 24, 24)).toBeNull();
  });

  it('fronteiras: índice negativo e janela vazia → null', () => {
    expect(timelineIndexToColumn(-1, 0, 48)).toBeNull();
    expect(timelineIndexToColumn(0, 0, 0)).toBeNull();
  });
});

describe('columnToTimelineIndex', () => {
  it('inverso directo do mapeamento', () => {
    expect(columnToTimelineIndex(0, 0)).toBe(0);
    expect(columnToTimelineIndex(6, 24)).toBe(30);
  });

  it('round-trip dentro da janela', () => {
    for (const i of [0, 13, 47]) {
      const col = timelineIndexToColumn(i, 0, 48);
      expect(col).not.toBeNull();
      expect(columnToTimelineIndex(col!, 0)).toBe(i);
    }
  });
});

/**
 * Agrupamento por dia da lista «Hora a hora» (SP-B — SPOT-UX-V3.md §5):
 * uma linha por hora, cabeçalhos «Quarta, 23» a cada mudança de dia civil.
 * As horas são wall-time Open-Meteo — a função não toca em Date.now() nem
 * no fuso da máquina.
 */
describe('groupForecastDays', () => {
  const hours = (from: number, count: number) =>
    Array.from({ length: count }, (_, k) => ({
      time: `2026-09-${String(23 + Math.floor((from + k) / 24)).padStart(2, '0')}T${String(
        (from + k) % 24,
      ).padStart(2, '0')}:00`,
    }));

  it('agrupa por dia civil preservando a ordem e os índices', () => {
    // 14:00 → +30 h atravessa a meia-noite: 10 h no dia 23 + 21 no dia 24.
    const groups = groupForecastDays(hours(14, 31), 'pt');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ day: '2026-09-23', startIndex: 0, count: 10 });
    expect(groups[1]).toMatchObject({ day: '2026-09-24', startIndex: 10, count: 21 });
  });

  it('rótulos: curto «qua 23», longo «Quarta, 23» (2026-09-23 é quarta)', () => {
    const [g] = groupForecastDays(hours(0, 24), 'pt');
    expect(g.shortLabel).toBe('qua 23');
    expect(g.longLabel).toBe('Quarta, 23');
  });

  it('rótulo longo traduzido (en/de/fr) e estável em qualquer fuso', () => {
    const [en] = groupForecastDays(hours(0, 2), 'en');
    const [de] = groupForecastDays(hours(0, 2), 'de');
    const [fr] = groupForecastDays(hours(0, 2), 'fr');
    expect(en.longLabel).toBe('Wednesday, 23');
    expect(de.longLabel).toBe('Mittwoch, 23');
    expect(fr.longLabel).toBe('Mercredi, 23');
  });

  it('um só dia → um grupo; array vazio → zero grupos', () => {
    const groups = groupForecastDays(hours(9, 6), 'pt');
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(6);
    expect(groupForecastDays([], 'pt')).toEqual([]);
  });

  it('travessia de mês: dia civil lê-se da string, não de Date local', () => {
    const groups = groupForecastDays(
      [{ time: '2026-09-30T23:00' }, { time: '2026-10-01T00:00' }],
      'pt',
    );
    expect(groups.map((g) => g.day)).toEqual(['2026-09-30', '2026-10-01']);
    // 2026-10-01 é quinta-feira.
    expect(groups[1].longLabel).toBe('Quinta, 1');
  });
});

describe('formatDayLong', () => {
  it('string fora do formato ISO → rótulo vazio', () => {
    expect(formatDayLong('não é data', 'pt')).toBe('');
    expect(formatDayLong('', 'pt')).toBe('');
  });
});
