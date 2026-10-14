/**
 * Escala única da nota (#210). O motor (`sportScore.ts`) continua a calcular
 * 0–100 e a fórmula não muda; tudo o que o site mostra passa por aqui e sai
 * como nota inteira /10. Nenhum outro ficheiro define a escala nem as bandas.
 *
 * - Conversão: `nota = round(score / 10)`, inteira 0–10 (NaN/±∞ → 0).
 * - Bandas sobre a nota (como `docs/design/maquetes/modalidades-avalia.js`,
 *   que arredonda primeiro e só depois classifica):
 *   Não dá < 3 ≤ Fraco < 5 ≤ Dá < 7 ≤ Bom < 9 ≤ Muito bom.
 * - Limiares: «nota ≥ n» ⇔ «score ≥ 10·n − 5» (`notaMinScore`), o menor score
 *   que arredonda para n. Assim um filtro em 0–100 e a nota mostrada nunca
 *   discordam (score 65 já se mostra 7 · Bom, logo já conta como «Bom»).
 */
import type { ScoreTier } from '@/lib/sportScore';

export const NOTA_MAX = 10;

/** Nota mínima de cada banda (a banda «Não dá» começa em 0). */
export const NOTA_BAND_MIN = {
  epic: 9,
  good: 7,
  fair: 5,
  poor: 3,
} as const satisfies Record<Exclude<ScoreTier, 'closed'>, number>;

/** Score 0–100 → nota inteira 0–10. */
export function scoreToNota(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(NOTA_MAX, Math.round(score / 10)));
}

/** Menor score 0–100 cuja nota é ≥ `nota` (mapeamento dos limiares). */
export function notaMinScore(nota: number): number {
  if (!Number.isFinite(nota) || nota <= 0) return 0;
  return Math.min(NOTA_MAX, nota) * 10 - 5;
}

/** Banda de uma nota na escala 0–10 (aceita decimais: 2,9 → Não dá; 3 → Fraco). */
export function notaTier(nota: number): ScoreTier {
  if (!Number.isFinite(nota)) return 'closed';
  if (nota >= NOTA_BAND_MIN.epic) return 'epic';
  if (nota >= NOTA_BAND_MIN.good) return 'good';
  if (nota >= NOTA_BAND_MIN.fair) return 'fair';
  if (nota >= NOTA_BAND_MIN.poor) return 'poor';
  return 'closed';
}

/** Banda de um score 0–100 — sempre a banda da nota que se mostra. */
export function scoreTierFromScore(score: number): ScoreTier {
  return notaTier(scoreToNota(score));
}

/** Limiares das bandas em espaço 0–100 (85 / 65 / 45 / 25). */
export const SCORE_TIER_THRESHOLDS = {
  epic: notaMinScore(NOTA_BAND_MIN.epic),
  good: notaMinScore(NOTA_BAND_MIN.good),
  fair: notaMinScore(NOTA_BAND_MIN.fair),
  poor: notaMinScore(NOTA_BAND_MIN.poor),
} as const;
