/**
 * Motor único (#218), PR 4: as notas da tabela horária do comparador.
 *
 * Surf, kitesurf, windsurf, bodyboard e foil saem do motor v6 hora a hora
 * (`notaUnica.notaHora` = `horaDeLinha` + `avaliaHorasSite` sobre a série do
 * forecast do spot), o mesmo
 * caminho da régua da página do spot e das frames do `map-hours.json`: a
 * mesma hora dá o mesmo número nas três. As vizinhas da série dão o sentido
 * da maré, por isso o motor recebe a série inteira e o índice da hora.
 * De noite (ou sem os dados que a modalidade precisa) o v6 não dá nota:
 * `null`, e a tabela mostra «—» como numa hora sem previsão.
 *
 * SUP e wakeboard ficam no `sportScore` (`getHourlyScores`, motor antigo; PR 6).
 */
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getHourlyScores, type Conditions } from '@/lib/sportScore';
import { modalidadeDe, notaHora, type SportScoreV6 } from '@/lib/notaUnica';
import { isDesportoMotorAntigo } from '@/lib/desportosV6';
import type { LinhaForecast } from '@/lib/horaSpot';
import { seriesTimeMs } from '@/lib/openMeteoTime';

type Linha = Record<string, unknown>;

const HOUR_MS = 3_600_000;

/**
 * Hora real (bucket de instante UTC) de uma etiqueta — a mesma regra do
 * `mapHoursBuild`: as séries do comparar podem vir em fusos diferentes
 * (Lisboa e Açores) e a mesma hora de parede não é o mesmo instante (#456).
 */
const horaSlot = (t: string): number => Math.floor(seriesTimeMs(t) / HOUR_MS);

/**
 * Score 0–100 de cada hora de `times` (etiquetas `time` da série do spot).
 * `null` = sem nota v6 (noite / sem dados) ou hora ausente da série.
 * `fallback` é o input «agora» já corrigido, usado pelo motor antigo para
 * preencher rajada e temperatura da água em falta (como até aqui).
 */
export function notasHorariasCompare(
  spot: Spot,
  sport: SportType,
  rows: readonly Linha[],
  times: readonly string[],
  fallback: Conditions,
): Array<number | null> {
  // Índice pelo instante, não pela string: `2026-11-12T12:00+00:00` (Lisboa)
  // e `2026-11-12T11:00-01:00` (Açores) são a mesma hora. Primeira linha em
  // empate, como no `mapHoursBuild`.
  const idx = new Map<number, number>();
  rows.forEach((r, j) => {
    const k = horaSlot(String(r.time ?? ''));
    if (Number.isFinite(k) && !idx.has(k)) idx.set(k, j);
  });
  const linhaDe = (t: string): number | undefined => {
    const k = horaSlot(t);
    return Number.isFinite(k) ? idx.get(k) : undefined;
  };

  if (modalidadeDe(sport)) {
    const linhas = rows as unknown as readonly LinhaForecast[];
    return times.map((t) => {
      const j = linhaDe(t);
      if (j === undefined) return null;
      const s = notaHora(spot, sport, linhas, j) as SportScoreV6;
      return s.nota == null ? null : s.score;
    });
  }

  if (!isDesportoMotorAntigo(sport)) return times.map(() => null);
  const hourly = times.map((t) => {
    const j = linhaDe(t);
    const r = (j === undefined ? undefined : rows[j]) as
      | { waveHeight?: number; wavePeriod?: number; windSpeed?: number; windDirection?: number; windGust?: number; waterTemp?: number }
      | undefined;
    return {
      time: t,
      waveHeight: r?.waveHeight ?? 0,
      wavePeriod: r?.wavePeriod ?? 0,
      windSpeed: r?.windSpeed ?? 0,
      windDirection: r?.windDirection ?? 0,
      windGust: r?.windGust ?? fallback.windGust,
      waterTemp: r?.waterTemp ?? fallback.waterTemp,
    };
  });
  const scores = getHourlyScores(spot, sport, hourly, fallback);
  return times.map((t, i) => (linhaDe(t) !== undefined ? (scores[i] ?? 0) : null));
}
