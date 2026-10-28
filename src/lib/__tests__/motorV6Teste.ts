/**
 * Motor único (#218), PR 6: ajuda dos testes portados do `sportScore` antigo.
 * Avalia UMA linha de condições (formato `Conditions`, m/s) pelo caminho do
 * site (`notaUnica.notaHora` = `horaDeLinha` + `avaliaHorasSite` + tecto de
 * segurança do vento), numa hora de dia de Verão (15/07 14:00, Lisboa).
 */
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { Conditions } from '@/lib/sportScore';
import type { LinhaForecast } from '@/lib/horaSpot';
import { notaHora, type SportScoreV6 } from '@/lib/notaUnica';

export const HORA_DIA = '2026-07-15T14:00';
export const HORA_NOITE = '2026-07-15T02:00';

/** nós → m/s (o forecast vem em m/s). */
export const kt = (n: number): number => n / 1.94384;

export function linhaDe(c: Partial<Conditions>, time = HORA_DIA, extra: Partial<LinhaForecast> = {}): LinhaForecast {
  return {
    time,
    waveHeight: c.waveHeight,
    wavePeriod: c.wavePeriod,
    waveDirection: c.waveDirection,
    windSpeed: c.windSpeed,
    windDirection: c.windDirection,
    windGust: c.windGust,
    waterTemp: c.waterTemp,
    tideHeight: 2,
    cloudCover: 0,
    ...extra,
  };
}

/** Nota v6 (formato `SportScore`) de uma linha de condições. */
export function v6(
  spot: Spot,
  sport: SportType,
  c: Partial<Conditions>,
  time = HORA_DIA,
  extra: Partial<LinhaForecast> = {},
): SportScoreV6 {
  return notaHora(spot, sport, [linhaDe(c, time, extra)], 0) as SportScoreV6;
}
