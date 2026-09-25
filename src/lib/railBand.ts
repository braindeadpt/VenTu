/**
 * A faixa de incerteza da régua de 48 h (spec v3 §3) — decisões puras, sem DOM
 * e sem texto.
 *
 * O que a régua acrescenta: por hora, o intervalo P10–P90 da ONDA — a mesma
 * banda que o cartão Onda põe numa frase, aqui desenhada hora a hora para se
 * poder comparar (procurar a hora boa *e* com modelos de acordo). O consumidor
 * é a `SpotTimeRail`; as siglas ficam em «Como sabemos».
 *
 * Três regras mandam no desenho, todas herdadas da auditoria de 25/09:
 *
 *  1. **Caixa fixa.** A faixa desenha-se sempre, mesmo nas horas sem banda (o
 *     produtor só escreve `ens` nas horas multi-modelo e nos runs de dia): a
 *     régua não pode mudar de altura ao arrastar. Aqui isso traduz-se em
 *     devolver `null` em vez de «nada» — quem desenha trata os dois casos.
 *  2. **Uma só escala para as 48 h visíveis** (mínimo dos P10 → máximo dos
 *     P90). Normalizar cada hora contra si própria faria a mesma incerteza
 *     parecer maior numa hora do que noutra — o desenho mentiria.
 *  3. **Nada desaparece por ser pequeno.** Uma banda estreita é a boa notícia
 *     («os modelos concordam») e tem de continuar visível: a marca tem uma
 *     altura mínima e nunca sai da lâmina.
 */
import { ENSEMBLE_MIN_MEMBERS, type EnsembleFamily } from './ensembleBand';

/**
 * Altura mínima da escala (m). Sem este chão, 48 h de mar pequeno (0,4–0,6 m)
 * esticavam um intervalo de 10 cm até à lâmina toda e a régua lia-se ao
 * contrário: pouco mar parecia muita incerteza.
 */
export const MIN_BAND_SCALE_M = 0.6;

/** Altura mínima da marca de uma hora, em fracção da lâmina (0..1). */
export const MIN_BAND_MARK = 0.09;

/** Uma hora da janela visível da régua, como a régua a vê. */
export interface RailBandHour {
  /** Banda de onda da hora — ausente nas horas best_match e nos runs de noite. */
  band?: EnsembleFamily | null;
  /** Onda prevista da hora (m) — entra na escala mesmo sem banda. */
  wave?: number | null;
}

export interface RailBandScale {
  min: number;
  max: number;
}

/** Marca de uma hora na escala: topo e altura em fracção 0..1 (0 = topo). */
export interface RailBandMark {
  top: number;
  height: number;
}

function usableWave(hour: RailBandHour | undefined): { p10: number; p90: number } | null {
  const b = hour?.band;
  if (!b) return null;
  if (!Number.isInteger(b.n) || b.n < ENSEMBLE_MIN_MEMBERS) return null;
  if (!Number.isFinite(b.p10) || !Number.isFinite(b.p90)) return null;
  return { p10: b.p10, p90: b.p90 };
}

/**
 * Escala partilhada da janela visível: mín. dos P10 (ou da onda, nas horas sem
 * banda) → máx. dos P90. Devolve `null` quando não há um único número — a
 * régua não inventa uma escala para depois desenhar uma faixa.
 */
export function railBandScale(hours: readonly RailBandHour[]): RailBandScale | null {
  let min = Infinity;
  let max = -Infinity;
  for (const hour of hours) {
    const band = usableWave(hour);
    if (band) {
      min = Math.min(min, band.p10);
      max = Math.max(max, band.p90);
      continue;
    }
    const wave = hour.wave;
    if (typeof wave === 'number' && Number.isFinite(wave)) {
      min = Math.min(min, wave);
      max = Math.max(max, wave);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const mid = (min + max) / 2;
  const half = Math.max((max - min) / 2, MIN_BAND_SCALE_M / 2);
  return { min: mid - half, max: mid + half };
}

/**
 * Marca da hora na escala — `null` sem banda publicável ou sem escala. A
 * marca fica sempre dentro de [0,1] e nunca mais baixa que `MIN_BAND_MARK`.
 */
export function railBandMark(
  hour: RailBandHour | undefined,
  scale: RailBandScale | null,
): RailBandMark | null {
  const band = usableWave(hour);
  if (!band || !scale) return null;
  const span = scale.max - scale.min;
  if (!(span > 0)) return null;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const hi = Math.max(band.p10, band.p90);
  const lo = Math.min(band.p10, band.p90);
  const top = clamp01((scale.max - hi) / span);
  const bottom = clamp01((scale.max - lo) / span);
  const height = Math.max(MIN_BAND_MARK, bottom - top);
  return { top: Math.min(top, 1 - height), height };
}

/**
 * Os números da hora escolhida, prontos a formatar — o gate é o mesmo do
 * produtor, do cartão Onda e da escala (uma família com menos de 3 membros não
 * tem banda para mostrar).
 */
export function railBandValue(
  hour: RailBandHour | undefined,
): { p10: number; p90: number; n: number } | null {
  const band = usableWave(hour);
  if (!band) return null;
  return { p10: band.p10, p90: band.p90, n: hour!.band!.n };
}
