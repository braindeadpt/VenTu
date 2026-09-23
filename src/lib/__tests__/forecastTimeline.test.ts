import { describe, expect, it } from 'vitest';
import {
  columnToTimelineIndex,
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
