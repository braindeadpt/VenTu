/**
 * Banda de score por hora — a versão em espaço-de-score da banda ensemble.
 *
 * O `ens` da linha traz P10/P50/P90 de altura de onda e de vento (famílias
 * independentes, n ≥ 3). Aplicar o scorer real aos cantos pessimista
 * (wave_p10 × wind_p10) e optimista (wave_p90 × wind_p90) dá o intervalo
 * de sensibilidade do score à divergência entre modelos — «o score pode
 * andar entre 45 e 78», não uma probabilidade (as marginais não são um
 * cenário conjunto e os membros de onda do ensemble-api vêm null — foi
 * verificado ao vivo antes de apostar noutra rota).
 *
 * Direcção/período/rajada/temperatura seguem a linha determinística: a
 * banda responde à pergunta «quanto muda o número grande» e é por isso que
 * só os dois drivers com quantis variam. Sem banda válida → null, nunca
 * um intervalo inventado.
 */
import type { Spot } from '@/types';
import { getSportScore } from './sportScore';
import type { SportType } from './sportRatings';
import { ENSEMBLE_MIN_MEMBERS, type EnsembleBand } from './ensembleBand';

export interface ScoreBand {
  lo: number;
  hi: number;
}

export interface ScoreBandHour {
  waveDirectionDeg?: number;
  wavePeriodS?: number;
  windDirectionDeg?: number;
  windGustMs?: number;
  waterTempC?: number;
}

/**
 * Intervalo de score da hora escolhida, ou null quando a banda não cobre
 * as duas famílias (uma só margem não fecha o canto conjunto).
 */
export function scoreRangeForBand(input: {
  spot: Spot;
  sport: SportType;
  band?: EnsembleBand | null;
  hour: ScoreBandHour;
}): ScoreBand | null {
  const { spot, sport, band, hour } = input;
  const wave = band?.wave;
  const wind = band?.wind;
  if (!wave || !wind) return null;
  if (wave.n < ENSEMBLE_MIN_MEMBERS || wind.n < ENSEMBLE_MIN_MEMBERS) return null;

  const shared = {
    waveDirection: hour.waveDirectionDeg ?? 0,
    wavePeriod: hour.wavePeriodS ?? 8,
    windDirection: hour.windDirectionDeg ?? 0,
    waterTemp: hour.waterTempC ?? 15,
  };
  // Sem rajada por membro: a rajada segue o vento do canto (sem viés artificial
  // de uma rajada determinística misturada com um vento de outro cenário).
  const lo = getSportScore(spot, sport, {
    ...shared,
    waveHeight: wave.p10,
    windSpeed: wind.p10,
    windGust: hour.windGustMs ?? wind.p10,
  }).score;
  const hi = getSportScore(spot, sport, {
    ...shared,
    waveHeight: wave.p90,
    windSpeed: wind.p90,
    windGust: hour.windGustMs ?? wind.p90,
  }).score;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
}
