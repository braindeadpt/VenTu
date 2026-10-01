/**
 * Score da hora escolhida no eixo de tempo partilhado (useSpotTimeline).
 * Uma fonte por índice: no «agora» manda o score actual já calculado pela
 * página (correcções observadas incluídas — o mesmo número do badge do
 * herói); nas outras horas manda o score de previsão canónico, o mesmo que
 * alimenta a régua 48h e a ForecastTable. Função pura.
 */
export interface SpotTimelineScoreInput {
  /** Índice da hora escolhida. */
  index: number;
  /** Índice da hora «agora» (-1 antes de montar / sem horas). */
  nowIndex: number;
  /** Scores canónicos alinhados com as horas do eixo. */
  scores: readonly number[];
  /** Score «agora» com correcções observadas (opcional). */
  nowScore?: number;
}

export function spotTimelineScore({
  index,
  nowIndex,
  scores,
  nowScore,
}: SpotTimelineScoreInput): number | undefined {
  if (index === nowIndex && nowIndex >= 0 && typeof nowScore === 'number') {
    return nowScore;
  }
  return scores[index];
}
