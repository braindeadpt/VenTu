/**
 * Motor único (#218), PR 5: a manhã do Dawn Patrol no motor v6 (só pipeline —
 * `scripts/dawn-patrol.js`; nada disto vai para o browser).
 *
 * Antes o Dawn Patrol ia buscar o seu próprio Open-Meteo e dava-lhe uma
 * heurística própria (E4: ondas 0–50, período 0–20, vento 0–30). Agora lê a
 * MESMA série do spot (`public/data/forecasts/<id>.json`) e a mesma nota de
 * surf hora a hora (`notaUnica.notaHora` = `horaDeLinha` + `avaliaHoras`) que a
 * régua da página do spot mostra às 06–11 h: um objecto por spot e hora.
 * - A noite (sol abaixo do limiar) não tem nota e nunca é a melhor hora.
 * - As horas da manhã são sempre FUTURAS (a hora corrente e as anteriores vão
 *   para amanhã, como sempre fez o Dawn Patrol), por isso a nota é a da
 *   previsão, como na régua. As observações (boia) só corrigem a hora corrente
 *   (linha «agora» de D4), que nunca é uma destas: a antiga recalibração da
 *   manhã pela boia (sobre a heurística E4) deixa de se aplicar.
 */
import type { Spot } from '@/types';
import type { LinhaForecast } from '@/lib/horaSpot';
import { notaHora, type SportScoreV6 } from '@/lib/notaUnica';

/** Horas da manhã analisadas (hora de parede de Lisboa). */
export const HORAS_MANHA = [6, 7, 8, 9, 10, 11] as const;

export interface HoraManhaV6 {
  hour: number;
  /** Etiqueta da hora na série. */
  t: string;
  /** Índice na série. */
  j: number;
  /** Nota v6 de surf que a régua mostra (`null` = noite / sem dados). */
  nota: number | null;
  waveHeight: number;
  wavePeriod: number;
  waveDirection?: number;
  windSpeed: number;
  windDirection?: number;
  windGust?: number;
  waterTemp?: number;
  tideHeight?: number;
}

const lisbonDateStr = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(ms));
const lisbonHour = (ms: number) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: 'numeric', hour12: false }).format(new Date(ms))) % 24;

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

type SpotLocal = Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>;

/**
 * As horas da manhã (06–11 h; as que já passaram hoje vão para amanhã, como
 * sempre fez o Dawn Patrol) com a nota v6 de surf de cada uma.
 */
export function manhaSurfV6(
  spot: SpotLocal,
  linhas: readonly LinhaForecast[],
  nowMs: number,
): HoraManhaV6[] {
  if (!linhas?.length) return [];
  const hoje = lisbonDateStr(nowMs);
  const amanha = lisbonDateStr(nowMs + 24 * 3_600_000);
  const agoraH = lisbonHour(nowMs);
  const out: HoraManhaV6[] = [];
  for (const hour of HORAS_MANHA) {
    const dia = hour <= agoraH ? amanha : hoje;
    const prefixo = `${dia}T${String(hour).padStart(2, '0')}`;
    const j = linhas.findIndex((l) => String(l?.time ?? '').startsWith(prefixo));
    if (j < 0) continue;
    const l = linhas[j];
    out.push({
      hour,
      t: String(l.time),
      j,
      nota: (notaHora(spot, 'surf', linhas, j) as SportScoreV6).nota,
      waveHeight: num(l.waveHeight) ?? 0,
      wavePeriod: num(l.wavePeriod) ?? 0,
      waveDirection: num(l.waveDirection),
      windSpeed: num(l.windSpeed) ?? 0,
      windDirection: num(l.windDirection),
      windGust: num(l.windGust),
      waterTemp: num(l.waterTemp),
      tideHeight: num(l.tideHeight),
    });
  }
  return out;
}

/** A melhor hora da manhã: a maior nota (a noite não conta); empate → a mais cedo. */
export function melhorManhaV6(horas: readonly HoraManhaV6[]): HoraManhaV6 | null {
  let best: HoraManhaV6 | null = null;
  for (const h of horas) if (h.nota != null && (best == null || h.nota > (best.nota as number))) best = h;
  return best;
}
