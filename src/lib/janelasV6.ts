/**
 * Motor único (#218), PR 5: janelas de kitesurf e surf a partir das notas v6
 * hora a hora (as mesmas da régua do spot e das frames do `map-hours.json`).
 *
 * Módulo puro e leve (sem motor, sem editorial): recebe a série de notas já
 * calculada — `null` = noite ou sem dados — e devolve as janelas. Quem calcula
 * as notas é o pipeline/bake (`bestWindowBuild.ts`).
 *
 * Regra (a da régua e da frase do spot, `spotVeredicto.proxJanela` com
 * `minRank` = Bom): uma janela é uma sequência CONTÍNUA de horas com nota
 * ≥ 7 («Bom» ou «Muito bom», bandas da #210). É o que a cópia já promete
 * («Melhor janela ≥ Bom», «Sem janelas de nota ≥ 7»).
 * - A noite (`null`) parte a janela e nunca conta como hora de janela; uma
 *   hora sem dados também não.
 * - Mínimo de 2 horas (o mesmo mínimo das janelas antigas: «10h–10h» não é
 *   janela) e máximo de 24 h (partido em blocos, como antes).
 * - Nota da janela = média das notas das horas, arredondada PARA BAIXO (nunca
 *   acima do que a maioria das horas mostra; com todas ≥ 7 fica sempre ≥ 7).
 *   `score` = nota × 10, a escala que os componentes já lêem (`scoreToNota`).
 * - Ordem: nota, depois duração, depois a mais cedo.
 */
import { NOTA_BAND_MIN } from '@/lib/nota';

/** Nota mínima de uma hora de janela: «Bom» (7). */
export const JANELA_NOTA_MIN = NOTA_BAND_MIN.good;
/** Horas mínimas de uma janela. */
export const JANELA_MIN_HORAS = 2;
/** Horas máximas de uma janela (uma sequência maior é partida). */
export const JANELA_MAX_HORAS = 24;

export interface JanelaV6 {
  /** Índice da primeira hora (na série recebida). */
  a: number;
  /** Índice da última hora da janela (inclusive). */
  z: number;
  /** Nota da janela (média das horas, para baixo). */
  nota: number;
  /** `nota × 10` (escala 0–100 dos componentes). */
  score: number;
}

const horaDeJanela = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= JANELA_NOTA_MIN;

function bloco(notas: ReadonlyArray<number | null | undefined>, a: number, z: number): JanelaV6 {
  let soma = 0;
  for (let j = a; j <= z; j++) soma += notas[j] as number;
  const nota = Math.floor(soma / (z - a + 1) + 1e-9);
  return { a, z, nota, score: nota * 10 };
}

/** Todas as janelas da série, da melhor para a pior. */
export function janelasV6(notas: ReadonlyArray<number | null | undefined>): JanelaV6[] {
  const out: JanelaV6[] = [];
  const fecha = (a: number, z: number) => {
    for (let s = a; s <= z; s += JANELA_MAX_HORAS) {
      const e = Math.min(s + JANELA_MAX_HORAS - 1, z);
      if (e - s + 1 >= JANELA_MIN_HORAS) out.push(bloco(notas, s, e));
    }
  };
  let a = -1;
  for (let j = 0; j < notas.length; j++) {
    if (horaDeJanela(notas[j])) {
      if (a < 0) a = j;
    } else if (a >= 0) {
      fecha(a, j - 1);
      a = -1;
    }
  }
  if (a >= 0) fecha(a, notas.length - 1);
  return out.sort((x, y) => y.score - x.score || y.z - y.a - (x.z - x.a) || x.a - y.a);
}

/** A melhor janela da série, ou `null`. */
export function melhorJanelaV6(notas: ReadonlyArray<number | null | undefined>): JanelaV6 | null {
  return janelasV6(notas)[0] ?? null;
}
