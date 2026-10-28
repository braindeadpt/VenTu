/**
 * Motor único (#218), PR 3: construção do `notaV6` «agora» (só pipeline e
 * testes — nada disto vai para o browser; o cliente só lê, ver
 * `notaV6Agora.ts`).
 *
 * Linha «agora» de D4 (uma só para o site, a dos alertas): a hora do forecast
 * que contém o instante (`alertRowAt` de `scripts/lib/scoreSpotConditions.js`,
 * comparada por instante: Açores e o 01:00 repetido) com a linha do
 * `conditions.json` por baixo — as chaves de observação (boia, vento observado)
 * ficam e `rawToScoreInput` só as aplica se frescas. Essa linha vai para o
 * lugar da hora coberta da série, para o sentido da maré sair das vizinhas
 * como na página do spot, e o v6 avalia-a pelo caminho de sempre
 * (`notaUnica.notaHora` = `horaDeLinha` + `avaliaHorasSite`, tecto de
 * segurança incluído). É também a frame 0 do `map-hours.json` (as cinco
 * modalidades v6: surf, kitesurf, windsurf, bodyboard, foil — PR 6).
 */
import type { Spot } from '@/types';
import type { LinhaForecast } from '@/lib/horaSpot';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { findCoveredHourIndex, lisbonHourKeyFromDate } from '@/lib/openMeteoTime';
import { notaHora, type SportScoreV6 } from '@/lib/notaUnica';
import { MODALIDADES_AGORA, type ModalidadeAgora, type NotaV6Agora } from '@/lib/notaV6Agora';
import type { SportType } from '@/lib/sportRatings';
import { melhorTodos } from '@/lib/desportosV6';

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Linha (`conditions.json` ou a linha «agora») no formato que o v6 lê
 * (`LinhaForecast`), pelo mesmo caminho do motor antigo: `rawToScoreInput`
 * (boia e vento observado quando frescos), como em `notaV6DeCondicoes`. O que
 * a linha não traz fica `undefined` (sem dados para o v6, não 0); `time` é a
 * etiqueta da hora coberta do forecast (com desvio: o sol conta pelo instante).
 */
export function linhaDeCondicoes(raw: Record<string, unknown>, time: string, nowMs?: number): LinhaForecast {
  const c = rawToScoreInput(raw, nowMs);
  const temVento = finito(raw.windSpeed) || c.windSpeed > 0;
  const temOnda = finito(raw.waveHeight) || c.waveHeight > 0;
  return {
    time,
    ...(temVento ? { windSpeed: c.windSpeed, windDirection: c.windDirection } : {}),
    ...(temVento && c.windGust > 0 ? { windGust: c.windGust } : {}),
    ...(temOnda ? { waveHeight: c.waveHeight, wavePeriod: c.wavePeriod } : {}),
    ...(finito(raw.waveDirection) ? { waveDirection: c.waveDirection } : {}),
    ...(finito(raw.swellDirection) ? { swellDirection: raw.swellDirection } : {}),
    ...(finito(raw.waterTemp) ? { waterTemp: c.waterTemp } : {}),
    ...(finito(raw.airTemp) ? { airTemp: raw.airTemp } : {}),
    ...(finito(raw.tideHeight) ? { tideHeight: raw.tideHeight } : {}),
    ...(finito(raw.precipitation) ? { precipitation: raw.precipitation } : {}),
    ...(finito(raw.cloudCover) ? { cloudCover: raw.cloudCover } : {}),
  };
}

/** Campos da hora do forecast que não passam para a linha avaliada (igual a `alertRowAt`). */
const FORECAST_SKIP_KEYS = new Set(['time', 'ens']);

/**
 * Gémea TS de `alertRowAt` (scripts/lib/scoreSpotConditions.js; o teste
 * `notaV6Agora.test.ts` prova que dão a mesma linha): a hora do forecast que
 * contém `nowMs` sobre a linha do `conditions.json`. `j` = índice dessa hora
 * na série (-1 sem previsão para a hora → a própria linha do conditions).
 */
export function linhaAgora(
  condRow: Record<string, unknown> | null | undefined,
  hours: ReadonlyArray<Record<string, unknown>> | null | undefined,
  nowMs: number,
): { row: Record<string, unknown> | null; j: number; t: string | undefined } {
  const lista = Array.isArray(hours) ? hours : [];
  const j = findCoveredHourIndex(
    lista.map((h) => (h && typeof h.time === 'string' ? h.time : '')),
    new Date(nowMs),
  );
  const base = condRow && typeof condRow === 'object' ? condRow : null;
  if (j < 0) return { row: base, j: -1, t: undefined };
  const row: Record<string, unknown> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(lista[j])) {
    if (FORECAST_SKIP_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    row[k] = v;
  }
  return { row, j, t: lista[j].time as string };
}

/**
 * Linhas e índice que o v6 avalia no «agora»: a linha de D4 no lugar da hora
 * coberta da série (as vizinhas dão o sentido da maré). Sem a hora na série,
 * a linha sozinha com a hora de Lisboa (como `notaV6DeCondicoes`).
 */
export function linhasAgora(
  condRow: Record<string, unknown> | null | undefined,
  hours: ReadonlyArray<Record<string, unknown>> | null | undefined,
  nowMs: number,
): { linhas: readonly LinhaForecast[]; j: number } | null {
  const { row, j, t } = linhaAgora(condRow, hours, nowMs);
  if (!row) return null;
  if (j < 0 || !t) {
    const tl = `${lisbonHourKeyFromDate(new Date(nowMs))}:00`;
    return { linhas: [linhaDeCondicoes(row, tl, nowMs)], j: 0 };
  }
  const copia = (hours as unknown as LinhaForecast[]).slice();
  copia[j] = linhaDeCondicoes(row, t, nowMs);
  return { linhas: copia, j };
}

type SpotLocal = Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>;

/** Desporto do site de cada chave do `notaV6`. */
const DESPORTO_DE: Record<ModalidadeAgora, SportType> = {
  kite: 'kitesurf',
  surf: 'surf',
  windsurf: 'windsurf',
  bodyboard: 'bodyboard',
  foil: 'foil',
};

/** Nota v6 das cinco modalidades v6 (PR 6) nas linhas de `linhasAgora` (`null` sem linha). */
export function notaV6DeLinhas(
  spot: SpotLocal,
  alvo: { linhas: readonly LinhaForecast[]; j: number } | null,
): NotaV6Agora | null {
  if (!alvo) return null;
  const r = {} as Record<ModalidadeAgora, SportScoreV6>;
  for (const m of MODALIDADES_AGORA) r[m] = notaHora(spot, DESPORTO_DE[m], alvo.linhas, alvo.j) as SportScoreV6;
  const out: NotaV6Agora = {
    t: String(alvo.linhas[alvo.j].time).slice(0, 16),
    kite: r.kite.nota,
    surf: r.surf.nota,
    windsurf: r.windsurf.nota,
    bodyboard: r.bodyboard.nota,
    foil: r.foil.nota,
  };
  if (r.foil.nota != null && r.foil.vertente) out.vf = r.foil.vertente;
  if (r.kite.nota != null && r.kite.directionSafety) out.seg = r.kite.directionSafety;
  const sg: NonNullable<NotaV6Agora['sg']> = {};
  for (const m of ['windsurf', 'foil'] as const) {
    const seg = r[m].directionSafety;
    if (r[m].nota != null && seg) sg[m] = seg;
  }
  if (sg.windsurf || sg.foil) out.sg = sg;
  if (r.kite.nota != null && r.kite.soProfissionais) out.sp = 1;
  const sem = MODALIDADES_AGORA.filter((m) => r[m].semDados);
  if (sem.length) out.sem = sem;
  const f: NotaV6Agora['f'] = {};
  for (const m of MODALIDADES_AGORA) if (r[m].nota != null && r[m].factorsEn.length) f[m] = r[m].factorsEn;
  if (Object.keys(f).length) out.f = f;
  return out;
}

/** `notaV6` «agora» de um spot (D4). `null` sem linha nenhuma (spot sem condições). */
export function notaV6AgoraDe(
  spot: SpotLocal,
  condRow: Record<string, unknown> | null | undefined,
  hours: ReadonlyArray<Record<string, unknown>> | null | undefined,
  nowMs: number,
): NotaV6Agora | null {
  return notaV6DeLinhas(spot, linhasAgora(condRow, hours, nowMs));
}

type SpotPipeline = SpotLocal & Partial<Pick<Spot, 'conditionsSource'>>;

/**
 * Grava `notaV6` em cada linha do `conditions.json` (muta `conditions`): uma
 * por spot, na linha do PRÓPRIO spot (os spots com `conditionsSource` têm a
 * sua cópia da linha da fonte, mas a praia — e a nota — é a deles).
 * Devolve quantos spots ficaram com nota e quantos de noite.
 */
export function escreverNotasV6Agora(
  spots: readonly SpotPipeline[],
  conditions: Record<string, Record<string, unknown>>,
  forecastFor: (dataId: string) => ReadonlyArray<Record<string, unknown>> | null | undefined,
  nowMs: number,
): { escritos: number; noite: number; semLinha: number } {
  let escritos = 0;
  let noite = 0;
  let semLinha = 0;
  for (const spot of spots) {
    const own = conditions[spot.id];
    if (!own || typeof own !== 'object') continue;
    // a linha e a série do próprio spot primeiro, depois as da fonte — como
    // `computeAlertScore` e a frame 0 do `map-hours.json`
    const src = spot.conditionsSource;
    const hours = forecastFor(spot.id) ?? (src ? forecastFor(src) : null);
    const nv = notaV6AgoraDe(spot, own, hours, nowMs);
    if (!nv) {
      delete own.notaV6;
      semLinha++;
      continue;
    }
    own.notaV6 = nv;
    escritos++;
    if (MODALIDADES_AGORA.every((m) => nv[m] == null) && !nv.sem) noite++;
  }
  return { escritos, noite, semLinha };
}

/** O que o remendo lê do `map-hours.json`. */
interface MapHoursLike {
  times: string[];
  spots: Record<string, Record<string, Array<number | null>>>;
}

/**
 * Depois do merge das observações (que corre depois do `map-hours.json` no run
 * full), a frame 0 das modalidades v6 passa a ser o `notaV6` acabado de gravar
 * (× 10), para o «agora» da régua e o dos marcadores serem o mesmo número; o
 * `best` dessa frame é recalculado com a regra do «Todos» (`melhorTodos`:
 * máximo das v6 com nota, SUP / wakeboard só em spots sem modalidade v6;
 * `null` = noite). Só quando a frame 0 é a hora que contém `nowMs` (num run só
 * de observações, horas depois, a frame 0 já é passado e fica como está).
 * Muta `file`; devolve quantos spots mudaram.
 */
export function remendarFrame0(
  file: MapHoursLike,
  notas: Record<string, NotaV6Agora | undefined>,
  nowMs: number,
  spotDe: (id: string) => Pick<Spot, 'type' | 'compatibleSports'> | undefined = () => undefined,
): number {
  if (!file?.times?.length || findCoveredHourIndex([file.times[0]], new Date(nowMs)) !== 0) return 0;
  let n = 0;
  for (const [id, series] of Object.entries(file.spots ?? {})) {
    const nv = notas[id];
    if (!nv || !series) continue;
    let mudou = false;
    for (const d of MODALIDADES_AGORA) {
      const s = series[DESPORTO_DE[d]];
      if (!Array.isArray(s) || !s.length) continue;
      const nota = nv[d];
      // modalidade que o notaV6 não traz (ficheiro anterior ao PR 6): a frame fica
      if (nota === undefined) continue;
      const v = nota == null ? null : nota * 10;
      if (s[0] !== v) {
        s[0] = v;
        mudou = true;
      }
    }
    if (!mudou) continue;
    if (Array.isArray(series.best) && series.best.length) {
      // spot desconhecido: a regra das v6
      const spot = spotDe(id) ?? { type: 'surf', compatibleSports: ['surf'] };
      series.best[0] = melhorTodos(spot, (sport) => series[sport]?.[0]);
    }
    n++;
  }
  return n;
}
