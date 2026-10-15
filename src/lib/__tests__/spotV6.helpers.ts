export { avaliaHoras, bandaDe, MODALIDADES_VISIVEIS, tectoSeguranca } from '@/lib/modalidades';
import { scoreToNota, notaToScore } from '@/lib/nota';
/** Arredondamento do tecto offshore no resto do site (scoreToNota(25)). */
export const WIND_OFFSHORE_ROUND = scoreToNota(notaToScore(2.5));
