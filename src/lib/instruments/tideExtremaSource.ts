/**
 * Fonte dos extremos de maré no instrumento (docs/design/SPOT-PAGE.md §4).
 *
 * A tábua canónica — `findTideExtrema`, a mesma função que alimenta o
 * TideScheduleStrip do painel de detalhe — tem prioridade: cartão e tábua
 * mostram a MESMA hora para o mesmo extremo. A interpolação parabólica
 * (`tideExtrema`) fica como fallback quando não há tábua a cobrir a janela.
 *
 * Os eventos da tábua são alinhados ao eixo da curva por interpolação
 * linear do timestamp — um extremo a meio da hora cai num índice
 * fraccional, pronto para o caso de uma tábua oficial com minutos.
 */

import {
  findTideExtrema,
  type TideEvent,
  type TideHourPoint,
  type TideSchedule,
} from '@/lib/tideSchedule';
import { hhmmAt, tideExtrema, type TideExtremum } from './tideExtrema';

/** «schedule» = tábua canónica (findTideExtrema sobre a série horária do
 *  MODELO — não a tábua oficial IH, que hoje só alimenta a camada do mapa);
 *  «model» = parábola sobre a série. */
export type TideExtremaSource = 'schedule' | 'model';

export interface ResolvedTideExtrema {
  extrema: TideExtremum[];
  source: TideExtremaSource;
}

/**
 * Alinha eventos de maré ao eixo da curva horária.
 * Posição fraccional por interpolação linear do timestamp (evento a meio
 * da hora → índice fraccional); altura interpolada na série; eventos fora
 * da janela da curva são descartados.
 */
export function alignTideEventsToSeries(
  events: TideEvent[],
  series: TideHourPoint[],
): TideExtremum[] {
  const pts = series
    .map((p, i) => ({ i, ms: new Date(p.time).getTime(), h: p.tideHeight, time: p.time }))
    .filter(
      (p): p is { i: number; ms: number; h: number; time: string } =>
        Number.isFinite(p.ms) && typeof p.h === 'number' && !Number.isNaN(p.h),
    );
  if (pts.length < 2) return [];

  const first = pts[0];
  const last = pts[pts.length - 1];
  const out: TideExtremum[] = [];

  for (const ev of events) {
    const t = ev.at.getTime();
    if (t < first.ms || t > last.ms) continue;

    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].ms <= t) i += 1;
    const a = pts[i];
    const b = pts[i + 1];
    const span = b.ms - a.ms;
    const frac = span > 0 ? Math.min(1, Math.max(0, (t - a.ms) / span)) : 0;

    out.push({
      type: ev.type,
      index: a.i + frac * (b.i - a.i),
      height: a.h + (b.h - a.h) * frac,
      hhmm: hhmmAt(a.time, frac * (b.i - a.i)),
    });
  }
  return out;
}

/**
 * Escolhe a fonte dos extremos do cartão:
 * - `schedule` existe E a tábua cobre a janela → extremos canónicos ('schedule');
 * - caso contrário → parábola sobre a série ('model').
 */
export function resolveTideExtrema(opts: {
  schedule: TideSchedule | null;
  /** Janela da curva (48 h já filtrada). */
  series: TideHourPoint[];
  /** Série completa da tábua — o contexto ±2 h nas pontas da janela. */
  tableSeries: TideHourPoint[];
}): ResolvedTideExtrema {
  const { schedule, series, tableSeries } = opts;
  if (schedule) {
    const events = findTideExtrema(tableSeries.length ? tableSeries : series);
    const aligned = alignTideEventsToSeries(events, series);
    if (aligned.length) return { extrema: aligned, source: 'schedule' };
  }
  return { extrema: tideExtrema(series), source: 'model' };
}
