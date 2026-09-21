/**
 * Janelas contíguas de score ≥ limiar sobre o eixo de tempo partilhado da
 * página de spot (docs/design/SPOT-PAGE.md §3). Função pura — a régua marca
 * estas janelas com parêntese fino + etiqueta curta.
 */
export interface SpotWindow {
  /** Índice da primeira hora da janela (inclusivo). */
  startIdx: number;
  /** Índice da última hora da janela (inclusivo). */
  endIdx: number;
  /** Índice da hora de pico — primeiro máximo em caso de empate. */
  peakIdx: number;
  /** Score do pico. */
  peakScore: number;
}

/**
 * Devolve as janelas de `scores` com valor ≥ `threshold` (60 por omissão —
 * o corte «Bom» da escala de score), ordenadas por pico descendente
 * (empate: janela mais cedo primeiro). Uma hora abaixo do limiar parte a
 * janela — nunca funde através de um buraco.
 */
export function spotWindows(scores: readonly number[], threshold = 60): SpotWindow[] {
  const windows: SpotWindow[] = [];
  let start = -1;
  let peakIdx = -1;
  let peakScore = -Infinity;

  const flush = (endIdx: number) => {
    if (start < 0) return;
    windows.push({ startIdx: start, endIdx, peakIdx, peakScore });
    start = -1;
    peakIdx = -1;
    peakScore = -Infinity;
  };

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s >= threshold) {
      if (start < 0) start = i;
      if (s > peakScore) {
        peakScore = s;
        peakIdx = i;
      }
    } else {
      flush(i - 1);
    }
  }
  flush(scores.length - 1);

  return windows.sort((a, b) => b.peakScore - a.peakScore || a.startIdx - b.startIdx);
}
