/**
 * Extremos da curva de maré horária (docs/design/SPOT-PAGE.md §4).
 *
 * Diferente de `findTideExtrema` (tideSchedule.ts), que devolve a HORA
 * cheia do extremo para a tábua textual, aqui cada extremo é refinado por
 * interpolação parabólica de 3 pontos — o vértice cai entre horas
 * (índice fraccional + altura interpolada), que é o que a curva de 48 h
 * precisa para posicionar as marcas PM/BM no sítio exacto.
 *
 * Vértice da parábola por (i-1, i, i+1), espaçamento 1 h:
 *   offset d = 0.5·(y₋₁ − y₊₁) / (y₋₁ − 2·y₀ + y₊₁)   horas a partir de i
 *   altura  = y₀ − 0.25·(y₋₁ − y₊₁)·d
 */

import type { TideHourPoint } from '@/lib/tideSchedule';

export interface TideExtremum {
  type: 'high' | 'low';
  /** Índice fraccional na série (6.045 = 45·60/1000 min depois da hora 6). */
  index: number;
  /** Altura interpolada no vértice, m (MSL-relativa). */
  height: number;
  /** «HH:MM» local do vértice (a série já vem em hora local Europe/Lisbon). */
  hhmm: string;
}

const EXTREMA_WINDOW = 2;
const MIN_EXTREMA_DELTA = 0.06;

function hhmmAt(time: string, offsetHours: number): string {
  const hm = time.slice(11, 16).split(':');
  const totalMinRaw = Number(hm[0]) * 60 + Number(hm[1] ?? 0) + offsetHours * 60;
  const totalMin = ((Math.round(totalMinRaw) % 1440) + 1440) % 1440;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Extremos locais da série horária com posição/altura refinadas por parábola. */
export function tideExtrema(points: TideHourPoint[]): TideExtremum[] {
  const series = points
    .filter((p) => typeof p.tideHeight === 'number' && !Number.isNaN(p.tideHeight))
    .map((p) => ({ time: p.time, h: p.tideHeight as number }));

  if (series.length < 3) return [];

  const raw: TideExtremum[] = [];

  for (let i = 0; i < series.length; i += 1) {
    const lo = Math.max(0, i - EXTREMA_WINDOW);
    const hi = Math.min(series.length - 1, i + EXTREMA_WINDOW);
    if (hi - lo < 2) continue;

    const { h: curr, time } = series[i];
    let isHigh = true;
    let isLow = true;
    let minOther = Infinity;
    let maxOther = -Infinity;

    for (let j = lo; j <= hi; j += 1) {
      if (j === i) continue;
      const h = series[j].h;
      if (h >= curr) isHigh = false;
      if (h <= curr) isLow = false;
      minOther = Math.min(minOther, h);
      maxOther = Math.max(maxOther, h);
    }

    let type: 'high' | 'low' | null = null;
    if (isHigh && curr - minOther >= MIN_EXTREMA_DELTA) type = 'high';
    else if (isLow && maxOther - curr >= MIN_EXTREMA_DELTA) type = 'low';
    if (!type) continue;

    // Refino parabólico — só em pontos interiores com curvatura definida.
    let index = i;
    let height = curr;
    if (i >= 1 && i <= series.length - 2) {
      const yPrev = series[i - 1].h;
      const yNext = series[i + 1].h;
      const denom = yPrev - 2 * curr + yNext;
      if (Math.abs(denom) > 1e-9) {
        const d = 0.5 * (yPrev - yNext) / denom;
        // Um vértice credível fica dentro da célula (|d| ≤ 1).
        if (Math.abs(d) <= 1) {
          index = i + d;
          height = curr - 0.25 * (yPrev - yNext) * d;
        }
      }
    }

    raw.push({ type, index, height, hhmm: hhmmAt(time, index - i) });
  }

  // Funde repetições consecutivas do mesmo tipo (mantém o extremo forte).
  const merged: TideExtremum[] = [];
  for (const ev of raw) {
    const last = merged[merged.length - 1];
    if (!last || last.type !== ev.type) {
      merged.push(ev);
      continue;
    }
    const stronger = ev.type === 'high' ? ev.height > last.height : ev.height < last.height;
    if (stronger) merged[merged.length - 1] = ev;
  }
  return merged;
}

/** Próximo extremo depois do índice fraccional `k` na série. */
export function nextTideExtremum(
  extrema: TideExtremum[],
  k: number,
): TideExtremum | undefined {
  return extrema.find((e) => e.index > k);
}

/** Maré a encher ou a vazar no índice `i` (série horária). */
export function tideDirectionAt(
  points: TideHourPoint[],
  i: number,
): 'rising' | 'falling' | null {
  const curr = points[i]?.tideHeight;
  if (typeof curr !== 'number') return null;
  const prev = points[Math.max(0, i - 1)]?.tideHeight;
  const next = points[Math.min(points.length - 1, i + 1)]?.tideHeight;
  if (typeof prev !== 'number' || typeof next !== 'number') return null;
  return next >= prev ? 'rising' : 'falling';
}
