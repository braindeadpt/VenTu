import { formatDayShort } from '@/lib/verdict/formatHourLabel';

/**
 * Etiquetas do eixo da régua de 48 h — decide quais se vêem sem colisões,
 * medindo o texto em PÍXEIS (spec v3 §3 — a versão por distância em horas
 * sobrepunha «qua 23» e «12h» no mobile, auditoria S8).
 *
 * Candidatos, por prioridade:
 *  1. `day`  — mudanças de dia («seg 21») — a informação que ancora o eixo;
 *  2. `noon` — o tique das 12h;
 *  3. `hour` — os restantes múltiplos de 6 h wall-time (00h é sempre dia).
 *
 * `pickRailAxisLabelsPx` é pura: recebe as caixas em píxeis (centro por
 * índice + largura medida com canvas measureText ou getBoundingClientRect)
 * e devolve o subconjunto sem sobreposições, com `minGapPx` entre bordas.
 * Dias primeiro — entre dois dias que colidem prevalece o posterior (a
 * etiqueta parcial do início sacrifica-se, como na versão por horas).
 */

export interface RailAxisLabel {
  /** Índice dentro da janela visível (0..n-1). */
  index: number;
  /** Texto pronto a mostrar («seg 21» ou «06h»). */
  label: string;
  /** Prioridade — 'day' > 'noon' > 'hour' nas colisões. */
  kind: 'day' | 'noon' | 'hour';
}

const KIND_PRIORITY: Record<RailAxisLabel['kind'], number> = {
  day: 0,
  noon: 1,
  hour: 2,
};

/** Candidatos do eixo: fronteiras de dia + 12h + múltiplos de 6 h. */
export function railAxisCandidates(
  winHours: readonly string[],
  locale: string,
): RailAxisLabel[] {
  const out: RailAxisLabel[] = [];
  for (let i = 0; i < winHours.length; i++) {
    const h = winHours[i];
    if (i === 0 || h.slice(0, 10) !== winHours[i - 1].slice(0, 10)) {
      out.push({ index: i, label: formatDayShort(h, locale), kind: 'day' });
      continue;
    }
    const hh = Number(h.slice(11, 13));
    if (hh === 12) out.push({ index: i, label: '12h', kind: 'noon' });
    else if (hh % 6 === 0) out.push({ index: i, label: `${h.slice(11, 13)}h`, kind: 'hour' });
  }
  return out;
}

export interface RailAxisLabelPlaced extends RailAxisLabel {
  /** Posição de render em píxeis (left) — a caixa devolvida é a medida. */
  left: number;
}

interface LabelBox {
  cand: RailAxisLabel;
  left: number;
  right: number;
}

/** true se as caixas ficam a menos de `gapPx` uma da outra (ou sobrepostas). */
function collides(a: LabelBox, b: LabelBox, gapPx: number): boolean {
  return !(a.right + gapPx <= b.left || b.right + gapPx <= a.left);
}

/**
 * Caixa de render de uma etiqueta: centrada no tique mas CLAMPADA às bordas
 * da régua (uma etiqueta «qua 23» no índice 1 não pode sair do ecrã à
 * esquerda — a caixa medida é a que se vê). A primeira arruma à esquerda
 * do seu tique e a última à direita, como o componente as ancora.
 */
function labelBox(
  cand: RailAxisLabel,
  n: number,
  centerX: (index: number) => number,
  measure: (label: string) => number,
): LabelBox {
  const cx = centerX(cand.index);
  const w = Math.max(0, measure(cand.label));
  if (cand.index === 0) return { cand, left: cx, right: cx + w };
  if (cand.index >= n - 1) return { cand, left: cx - w, right: cx };
  const step = n > 1 ? Math.abs(centerX(1) - centerX(0)) : w;
  const railL = centerX(0) - step / 2;
  const railR = centerX(n - 1) + step / 2;
  const left = Math.max(0, Math.min(Math.max(cx - w / 2, railL), railR - w));
  return { cand, left, right: left + w };
}

/**
 * Escolhe as etiquetas que cabem sem colisão (gap mínimo `minGapPx`).
 * `centerX(i)` = centro em px do tique do índice i na régua; `measure(s)` =
 * largura de render da etiqueta (canvas measureText com o font do eixo).
 */
export function pickRailAxisLabelsPx(
  candidates: readonly RailAxisLabel[],
  n: number,
  centerX: (index: number) => number,
  measure: (label: string) => number,
  minGapPx = 8,
): RailAxisLabelPlaced[] {
  const boxes = candidates.map((c) => labelBox(c, n, centerX, measure));

  // Pass 1 — dias, em ordem: a fronteira posterior substitui as anteriores
  // que colidem (a etiqueta parcial do dia que começa o eixo sacrifica-se).
  const accepted: LabelBox[] = [];
  for (const b of boxes) {
    if (b.cand.kind !== 'day') continue;
    while (accepted.length && collides(accepted[accepted.length - 1], b, minGapPx)) {
      accepted.pop();
    }
    accepted.push(b);
  }

  // Pass 2 — noon antes de hour (prioridade), índice dentro de cada nível.
  const rest = boxes
    .filter((b) => b.cand.kind !== 'day')
    .sort(
      (a, b) =>
        KIND_PRIORITY[a.cand.kind] - KIND_PRIORITY[b.cand.kind] ||
        a.cand.index - b.cand.index,
    );
  for (const b of rest) {
    if (accepted.every((a) => !collides(a, b, minGapPx))) accepted.push(b);
  }

  return accepted
    .sort((a, b) => a.cand.index - b.cand.index)
    .map((b) => ({ ...b.cand, left: b.left }));
}
