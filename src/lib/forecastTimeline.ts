/**
 * Mapeamento índice da timeline partilhada ↔ coluna visível da
 * ForecastTable (S3 — docs/design/SPOT-PAGE.md §5).
 *
 * A tabela pode estar colapsada (menos horas que a timeline) ou fatiada
 * (`startTime` desloca a janela) — por isso o mapeamento recebe o início e
 * o número de colunas visíveis e devolve `null` quando a hora escolhida
 * não está renderizada (sem destaque, sem scroll).
 */

/** Índice global da timeline → posição da coluna visível; `null` fora da janela. */
export function timelineIndexToColumn(
  index: number,
  visibleStart: number,
  visibleCount: number,
): number | null {
  const col = index - visibleStart;
  return col >= 0 && col < visibleCount ? col : null;
}

/** Posição da coluna visível → índice global da timeline. */
export function columnToTimelineIndex(column: number, visibleStart: number): number {
  return visibleStart + column;
}
