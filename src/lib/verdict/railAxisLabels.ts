import { formatDayShort } from '@/lib/verdict/formatHourLabel';

/**
 * Etiquetas do eixo da régua de 48 h — decide quais se vêem sem colisões.
 *
 * Candidatos, por prioridade:
 *  1. Mudanças de dia («seg 21») — a informação que ancora o eixo;
 *  2. Horas redondas de 6 em 6 wall-time (00h/06h/12h/18h).
 *
 * Percorre-se por ordem de índice com um espaço mínimo `minGap` (em horas /
 * unidades de índice) entre etiquetas. Quando um candidato colide com a
 * etiqueta aceite anterior:
 *  - dia ganha sempre — substitui a anterior (mesmo outra etiqueta de dia:
 *    a fronteira de dia posterior prevalece porque descreve tudo o que vem
 *    a seguir; a etiqueta parcial do início sacrifica-se);
 *  - hora cede — esconde-se.
 *
 * O componente escolhe o `minGap` por largura (≥4 desktop, ≥6 mobile).
 */

export interface RailAxisLabel {
  /** Índice dentro da janela visível (0..n-1). */
  index: number;
  /** Texto pronto a mostrar («seg 21» ou «06h»). */
  label: string;
  /** Prioridade — 'day' vence 'hour' nas colisões. */
  kind: 'day' | 'hour';
}

export function pickRailAxisLabels(
  winHours: readonly string[],
  locale: string,
  minGap = 4,
): RailAxisLabel[] {
  const out: RailAxisLabel[] = [];
  for (let i = 0; i < winHours.length; i++) {
    const h = winHours[i];
    const dayChange =
      i === 0 || h.slice(0, 10) !== winHours[i - 1].slice(0, 10);
    const candidate: RailAxisLabel | null = dayChange
      ? { index: i, label: formatDayShort(h, locale), kind: 'day' }
      : Number(h.slice(11, 13)) % 6 === 0
        ? { index: i, label: `${h.slice(11, 13)}h`, kind: 'hour' }
        : null;
    if (!candidate) continue;

    const prev = out[out.length - 1];
    if (prev && candidate.index - prev.index < minGap) {
      if (candidate.kind === 'day') out[out.length - 1] = candidate;
      continue;
    }
    out.push(candidate);
  }
  return out;
}
