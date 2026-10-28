/**
 * Janelas pré-calculadas no bake (`load-spot-data.ts`) e no `spots-index.json`
 * — só servidor/pipeline: importa o motor v6 (`notaUnica`) e o editorial, que
 * não devem ir para o bundle das páginas. Os componentes só lêem os tipos e
 * `resolveBestWindowForSport` de `bestWindowToday.ts`.
 * Excepção: de noite, o comparador, os favoritos e o widget embed (páginas só
 * de cliente, sem linha do bake) calculam a próxima janela com
 * `computeUpcomingWindowsForSpot` por import DINÂMICO (`janelasNoiteCliente.ts`):
 * um chunk à parte que só carrega à noite.
 *
 * Motor único (#218), PR 5:
 * - Surf, kitesurf, windsurf, bodyboard e foil (PR 6; a Big Wave lê o surf,
 *   D8): a janela sai das notas v6 hora a hora (`notaUnica.notaHora` =
 *   `horaDeLinha` + `avaliaHorasSite`, o
 *   mesmo caminho da régua do spot e das frames do `map-hours.json`), pela
 *   regra de `janelasV6.ts` (horas contínuas ≥ 7 · Bom; a noite parte a
 *   janela). As horas são as da régua: a partir da hora que contém «agora».
 *   Na hora corrente vale a linha «agora» de D4 (`conditions.json[id].notaV6`,
 *   a mesma da hora 0 da régua e da frame 0 do mapa) quando o `notaV6` é dessa
 *   hora. Acabou a heurística E3 (`computeMagicWindows` sem `scores`) nestas
 *   modalidades.
 * - SUP e wakeboard (motor antigo) ficam como estavam: heurística para «hoje»
 *   e `getHourlyScores` para as 48 h.
 * - A melhor janela de hoje do spot (`bestWindowToday`) escolhe entre os
 *   desportos do «Todos» (`desportosV6.desportosTodos`): as escalas dos dois
 *   motores não se comparam.
 */
import { computeMagicWindows, type HourlyCondition } from '@/lib/magicWindows';
import { getCompatibleSports, type SportType } from '@/lib/sportRatings';
import { getHourlyScores, type Conditions } from '@/lib/sportScore';
import { modalidadeDe, notaHora, type SportScoreV6 } from '@/lib/notaUnica';
import { DESPORTO_PARA_AGORA, desportosTodos, isDesportoMotorAntigo } from '@/lib/desportosV6';
import { findCoveredHourIndex, seriesTimeMs } from '@/lib/openMeteoTime';
import { melhorJanelaV6 } from '@/lib/janelasV6';
import { buildNowMs } from '@/lib/buildClock';
import type { LinhaForecast } from '@/lib/horaSpot';
import type { NotaV6Agora } from '@/lib/notaV6Agora';
import type {
  BestWindowToday,
  BestWindowsBySport,
  ForecastHourRow,
  UpcomingWindowsBySport,
} from '@/lib/bestWindowToday';
import type { Spot } from '@/types';

const HOUR_MS = 3_600_000;

type SpotJanela = Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation' | 'compatibleSports' | 'bestWind' | 'type'> &
  Partial<Pick<Spot, 'aguaInterior'>>;

function toHourly(row: ForecastHourRow): HourlyCondition {
  return {
    time: row.time,
    waveHeight: row.waveHeight ?? 0,
    wavePeriod: row.wavePeriod ?? 0,
    windSpeed: row.windSpeed ?? 0,
    windDirection: row.windDirection ?? 0,
    windGust: row.windGust ?? 0,
    waterTemp: row.waterTemp ?? 0,
  };
}

/** Próximas `hours` horas (motor antigo, como sempre: só horas que começam depois de agora). */
function filterForecastNextHours(forecast: ForecastHourRow[], hours: number, nowMs: number): HourlyCondition[] {
  const cutoff = nowMs + hours * HOUR_MS;
  return forecast.map(toHourly).filter((h) => {
    const t = new Date(h.time).getTime();
    return t >= nowMs && t < cutoff;
  });
}

function hourFromForecastTime(iso: string): number {
  const parsed = Number(iso.slice(11, 13));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Índices (na série) das horas da régua dentro de `hours` horas: a hora que
 * contém `nowMs` e as seguintes, por instante (Açores e o 01:00 repetido).
 */
export function indicesRegua(forecast: readonly ForecastHourRow[], hours: number, nowMs: number): number[] {
  const out: number[] = [];
  let cutoff = Infinity;
  for (let j = 0; j < forecast.length; j++) {
    const t = seriesTimeMs(String(forecast[j]?.time ?? ''));
    if (!Number.isFinite(t) || t + HOUR_MS <= nowMs) continue;
    // `hours` horas a contar da primeira (a hora coberta), como a régua
    if (cutoff === Infinity) cutoff = t + hours * HOUR_MS;
    if (t < cutoff) out.push(j);
  }
  return out;
}

/**
 * Nota v6 (inteira, ou `null` = noite / sem dados) de cada índice `js` da
 * série, para um desporto v6. Na hora que contém `nowMs`, o `notaV6` «agora»
 * (D4) quando é dessa hora — o mesmo número da hora 0 da régua.
 */
export function notasV6Horas(
  spot: Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>,
  sport: SportType,
  forecast: readonly ForecastHourRow[],
  js: readonly number[],
  nowMs: number,
  notaV6?: NotaV6Agora | null,
): Array<number | null> {
  const linhas = forecast as unknown as readonly LinhaForecast[];
  const jAgora = findCoveredHourIndex(
    forecast.map((r) => String(r?.time ?? '')),
    new Date(nowMs),
  );
  const d = DESPORTO_PARA_AGORA[sport];
  // o «agora» do pipeline só quando é desta hora e traz a modalidade (um ficheiro anterior ao PR 6 não traz as novas)
  const agora = d && notaV6 != null && jAgora >= 0 && String(forecast[jAgora].time).slice(0, 16) === notaV6.t ? notaV6[d] : undefined;
  return js.map((j) => {
    if (agora !== undefined && j === jAgora) return agora;
    return (notaHora(spot, sport, linhas, j) as SportScoreV6).nota;
  });
}

/** Melhor janela v6 nas horas `js` da série → etiquetas da primeira e da última hora. */
function janelaV6(
  spot: SpotJanela,
  sport: SportType,
  forecast: readonly ForecastHourRow[],
  js: readonly number[],
  nowMs: number,
  notaV6?: NotaV6Agora | null,
): { startIso: string; endIso: string; score: number } | null {
  if (!js.length) return null;
  const w = melhorJanelaV6(notasV6Horas(spot, sport, forecast, js, nowMs, notaV6));
  if (!w) return null;
  return { startIso: String(forecast[js[w.a]].time), endIso: String(forecast[js[w.z]].time), score: w.score };
}

const v6Sport = (sport: SportType): SportType | null => (modalidadeDe(sport) ? sport : null);

/**
 * Melhor janela de HOJE por desporto (próximas 24 h, horas da régua).
 * Modalidades v6: v6. SUP e wakeboard: heurística. A melhor do spot escolhe
 * só entre os desportos do «Todos».
 */
export function computeBestWindowsForSpot(
  spot: SpotJanela,
  forecast: ForecastHourRow[],
  nowMs = buildNowMs(),
  notaV6?: NotaV6Agora | null,
): { bestWindowToday: BestWindowToday | null; bestWindowsBySport: BestWindowsBySport } {
  const bestWindowsBySport: BestWindowsBySport = {};
  let bestWindowToday: BestWindowToday | null = null;
  if (!forecast.length) return { bestWindowToday: null, bestWindowsBySport };

  const hourly = filterForecastNextHours(forecast, 24, nowMs);
  const js = indicesRegua(forecast, 24, nowMs);
  const contam = new Set<SportType>(desportosTodos(spot));

  for (const sport of getCompatibleSports(spot as Spot)) {
    let slice: { start: number; end: number; score: number } | null = null;
    const v6 = v6Sport(sport);
    if (v6) {
      const w = janelaV6(spot, v6, forecast, js, nowMs, notaV6);
      if (w) slice = { start: hourFromForecastTime(w.startIso), end: hourFromForecastTime(w.endIso), score: w.score };
    } else if (hourly.length) {
      const top = computeMagicWindows(hourly, sport, spot.bestWind || '')[0];
      const startRow = top ? hourly[top.start] : undefined;
      const endRow = top ? hourly[top.end] : undefined;
      if (top && startRow && endRow)
        slice = { start: hourFromForecastTime(startRow.time), end: hourFromForecastTime(endRow.time), score: top.score };
    }
    if (!slice) continue;
    bestWindowsBySport[sport] = slice;
    if (contam.has(sport) && (!bestWindowToday || slice.score > bestWindowToday.score)) bestWindowToday = { ...slice, sport };
  }

  return { bestWindowToday, bestWindowsBySport };
}

/**
 * Melhor janela das próximas 48 h por desporto (as 48 horas da régua do spot).
 * Modalidades v6: v6 (horas ≥ 7, a noite parte). SUP e wakeboard:
 * `getHourlyScores` + `computeMagicWindows`. Bake com o relógio da build; a UI tira as que
 * já acabaram no relógio de quem lê.
 */
export function computeUpcomingWindowsForSpot(
  spot: Spot,
  forecast: ForecastHourRow[],
  currentConditions: Conditions,
  nowMs = buildNowMs(),
  notaV6?: NotaV6Agora | null,
): UpcomingWindowsBySport {
  const out: UpcomingWindowsBySport = {};
  if (!forecast.length) return out;
  const hourly = filterForecastNextHours(forecast, 48, nowMs);
  const js = indicesRegua(forecast, 48, nowMs);

  for (const sport of getCompatibleSports(spot)) {
    const v6 = v6Sport(sport);
    if (v6) {
      const w = janelaV6(spot, v6, forecast, js, nowMs, notaV6);
      if (w) out[sport] = w;
      continue;
    }
    if (!hourly.length || !isDesportoMotorAntigo(sport)) continue;
    const scores = getHourlyScores(spot, sport, hourly, currentConditions);
    const top = computeMagicWindows(hourly, sport, spot.bestWind || '', scores)[0];
    if (!top) continue;
    const startRow = hourly[top.start];
    const endRow = hourly[top.end];
    if (!startRow || !endRow) continue;
    out[sport] = { startIso: startRow.time, endIso: endRow.time, score: top.score };
  }

  return out;
}
