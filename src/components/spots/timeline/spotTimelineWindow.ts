/**
 * Janela visível da régua de «Quando ir»: 48 h a partir da hora actual do
 * eixo partilhado (docs/design/SPOT-PAGE.md §3). O eixo cobre toda a previsão
 * (~7 dias); a régua e o autoplay vivem dentro desta janela.
 *
 * - nowIndex ≥ 0 → [nowIndex, nowIndex + windowHours)
 * - nowIndex < 0 (antes de montar / sem hora actual) → [0, windowHours)
 * - nunca além do array: perto do fim a janela encurta.
 */
export interface SpotTimelineWindow {
  /** Índice da primeira hora visível (inclusivo). */
  start: number;
  /** Índice logo a seguir à última hora visível (exclusivo). */
  end: number;
}

export const SPOT_TIMELINE_WINDOW_HOURS = 48;

export function spotTimelineWindow(
  hoursLength: number,
  nowIndex: number,
  windowHours: number = SPOT_TIMELINE_WINDOW_HOURS,
): SpotTimelineWindow {
  if (hoursLength <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.min(nowIndex >= 0 ? nowIndex : 0, hoursLength));
  return { start, end: Math.min(hoursLength, start + windowHours) };
}
