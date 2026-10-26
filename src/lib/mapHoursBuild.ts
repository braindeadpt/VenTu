/**
 * Construção de `public/data/map-hours.json` (pipeline: `scripts/build-map-hours.js`).
 * Separado de `mapHours.ts` (#218, PR 2): o cliente do /mapa só lê o ficheiro
 * (`fetchMapHours`, `scoreAtHour`, …) e não deve carregar os motores (v6 +
 * antigo) nem os dados editoriais no bundle. Nada aqui corre no browser.
 *
 * Kitesurf e surf vêm do motor v6 (`notaUnica.notaHora` = `horaDeLinha` +
 * `avaliaHoras`, o mesmo caminho da página do spot e da home): nota × 10 e
 * `null` de noite ou sem dados. As outras modalidades ficam no `sportScore`
 * até ao PR 6 (D5); `best` = máximo das modalidades com número nessa hora.
 */
import type { Spot } from '@/types';
import { ALL_SPORTS, type SportType } from '@/lib/sportRatings';
import { getAllSportScores } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { linhasAgora } from '@/lib/notaV6AgoraBuild';
import type { LinhaForecast } from '@/lib/horaSpot';
import { modalidadeDe, notaHora, type SportScoreV6 } from '@/lib/notaUnica';
import { findCoveredHourIndex, hourKeyFromOpenMeteo, lisbonHourKeyFromDate, seriesTimeMs } from '@/lib/openMeteoTime';
import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';
import { detectThermal, lisbonHourFromMapTime, thermalCode } from '@/lib/mapThermal';
import { orientacaoVento } from '@/lib/wind';
import {
  MAP_HOURS_STEP,
  pickMapHourTimes,
  pickMapTideHourTimes,
  type MapHoursFile,
  type MapHoursSeries,
  type MapTideCurve,
} from '@/lib/mapHours';

function forecastSeries(
  spot: Spot,
  forecasts: Record<string, Array<Record<string, unknown>>>,
): Array<Record<string, unknown>> {
  const own = forecasts[spot.id];
  if (Array.isArray(own) && own.length) return own;
  if (spot.conditionsSource && Array.isArray(forecasts[spot.conditionsSource])) {
    return forecasts[spot.conditionsSource];
  }
  return [];
}

function conditionsRow(
  spot: Spot,
  conditions: Record<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const own = conditions[spot.id];
  if (own && typeof own === 'object') return own;
  if (spot.conditionsSource) {
    const alias = conditions[spot.conditionsSource];
    if (alias && typeof alias === 'object') return alias;
  }
  return null;
}

const HOUR_MS = 3_600_000;
const hourSlot = (t: string) => Math.floor(seriesTimeMs(t) / HOUR_MS);
const slotIndex = new WeakMap<Array<Record<string, unknown>>, Map<number, number>>();

/**
 * Índice da linha da série na MESMA hora real que `time` (por instante,
 * auditoria M1/B3): as horas do mapa são de Lisboa e as séries dos Açores vêm
 * na hora deles, e o 01:00 repetido de 25/10 são duas horas diferentes.
 * Primeira linha em empate; -1 se a série não tem essa hora.
 */
function hourIndexForTime(series: Array<Record<string, unknown>>, time: string): number {
  let idx = slotIndex.get(series);
  if (!idx) {
    idx = new Map();
    for (let i = 0; i < series.length; i++) {
      const t = series[i]?.time;
      if (typeof t !== 'string') continue;
      const k = hourSlot(t);
      if (Number.isFinite(k) && !idx.has(k)) idx.set(k, i);
    }
    slotIndex.set(series, idx);
  }
  return idx.get(hourSlot(time)) ?? -1;
}

/** Linha da série na mesma hora real que `time` (ver `hourIndexForTime`). */
function hourRowForTime(
  series: Array<Record<string, unknown>>,
  time: string,
): Record<string, unknown> | null {
  const i = hourIndexForTime(series, time);
  return i >= 0 ? series[i] : null;
}

/** Série etiquetada na hora de parede de Lisboa (não Açores): é a que dá as horas do mapa. */
function isLisbonSeries(series: Array<Record<string, unknown>>): boolean {
  const t = String(series[0]?.time ?? '');
  const ms = seriesTimeMs(t);
  return Number.isFinite(ms) && lisbonHourKeyFromDate(new Date(ms)) === hourKeyFromOpenMeteo(t);
}

function sampleSeries(
  spots: Spot[],
  forecasts: Record<string, Array<Record<string, unknown>>>,
): Array<Record<string, unknown>> | undefined {
  const all = spots.map((s) => forecastSeries(s, forecasts)).filter((series) => series.length > 0);
  return all.find(isLisbonSeries) ?? all[0];
}

function finiteTideHeight(row: Record<string, unknown> | null): number | null {
  if (!row || row.tideHeight == null) return null; // null = sem dados (Number(null) seria 0)
  const n = Number(row.tideHeight);
  return Number.isFinite(n) ? n : null;
}

function curveForSpot(
  spot: Spot,
  forecasts: Record<string, Array<Record<string, unknown>>>,
  hourlyTimes: string[],
): MapTideCurve | null {
  const series = forecastSeries(spot, forecasts);
  const times: string[] = [];
  const height: number[] = [];
  for (const time of hourlyTimes) {
    const h = finiteTideHeight(hourRowForTime(series, time));
    if (h === null) continue;
    times.push(time);
    height.push(h);
  }
  if (height.length < 24) return null;
  return { spotId: spot.id, times, height };
}

function buildMapTides(
  spots: Spot[],
  forecasts: Record<string, Array<Record<string, unknown>>>,
  now: Date,
): Record<string, MapTideCurve> | undefined {
  const sample = sampleSeries(spots, forecasts);
  const hourlyTimes = pickMapTideHourTimes(
    (sample ?? []).map((h) => String(h.time ?? '')),
    now,
  );
  if (hourlyTimes.length < 24) return undefined;

  const tides: Record<string, MapTideCurve> = {};
  for (const region of MACRO_REGIONS) {
    if (region === 'Todos') continue;
    let best: MapTideCurve | null = null;
    for (const spot of spots) {
      if (getMacroRegion(spot.region) !== region) continue;
      const curve = curveForSpot(spot, forecasts, hourlyTimes);
      if (!curve) continue;
      if (!best || curve.height.length > best.height.length) best = curve;
    }
    if (best) tides[region] = best;
  }
  return Object.keys(tides).length ? tides : undefined;
}

// A linha ao vivo no formato do v6 vive com a linha «agora» de D4 (#218, PR 3).
export { linhaDeCondicoes } from '@/lib/notaV6AgoraBuild';

/**
 * Linhas e índice que o v6 avalia numa frame:
 * - frame «agora» (hora coberta): a linha «agora» de D4 (#218, PR 3) — a hora
 *   do forecast com as observações frescas por cima, como os alertas e o
 *   `notaV6` do `conditions.json` (`notaV6AgoraBuild.linhasAgora`), no lugar
 *   da hora coberta da série, para a maré subir/descer sair das vizinhas;
 * - outras frames: a linha do forecast nessa hora (sem ela: `null`, sem dados —
 *   o v6 não herda a linha ao vivo para horas futuras).
 */
function linhasV6(
  series: Array<Record<string, unknown>>,
  j: number,
  live: Record<string, unknown> | null,
  isNow: boolean,
  nowMs: number,
): { linhas: readonly LinhaForecast[]; j: number } | null {
  if (isNow && live) return linhasAgora(live, series, nowMs);
  return j >= 0 ? { linhas: series as unknown as LinhaForecast[], j } : null;
}

/** Score v6 (nota × 10) de uma frame, ou `null` (noite / sem dados). */
function scoreV6(spot: Spot, sport: SportType, alvo: { linhas: readonly LinhaForecast[]; j: number } | null): number | null {
  if (!alvo) return null;
  const r = notaHora(spot, sport, alvo.linhas, alvo.j) as SportScoreV6;
  return r.nota == null ? null : r.score;
}

export function buildMapHoursFile(opts: {
  forecasts: Record<string, Array<Record<string, unknown>>>;
  conditions: Record<string, Record<string, unknown>>;
  spots: Spot[];
  generatedAt?: string;
  now?: Date;
}): MapHoursFile {
  const now = opts.now ?? new Date();
  const sample = sampleSeries(opts.spots, opts.forecasts);
  const times = pickMapHourTimes(
    (sample ?? []).map((h) => String(h.time ?? '')),
    now,
  );
  const spots: MapHoursFile['spots'] = {};
  const hs: Record<string, number[]> = {};
  let hsFinite = 0;
  const sst: Record<string, number[]> = {};
  let sstFinite = 0;
  const thermal: Record<string, number[]> = {};
  let thermalFinite = 0;
  const currents: Record<string, { spd: number[]; dir: number[] }> = {};
  let currentFinite = 0;
  const wind: Record<string, { spd: number[]; dir: number[] }> = {};
  let windFinite = 0;

  for (const spot of opts.spots) {
    const series = forecastSeries(spot, opts.forecasts);
    const live = conditionsRow(spot, opts.conditions);
    const bySport: Record<string, MapHoursSeries> = {};
    for (const sport of ALL_SPORTS) bySport[sport] = [];
    bySport.best = [];
    const hsSeries: number[] = [];
    const sstSeries: number[] = [];
    const thermalSeries: number[] = [];
    const currentSpd: number[] = [];
    const currentDir: number[] = [];
    const windSpd: number[] = [];
    const windDir: number[] = [];

    for (const time of times) {
      const isNow = findCoveredHourIndex([time], now) === 0;
      const j = hourIndexForTime(series, time);
      const raw = (isNow && live) || (j >= 0 ? series[j] : null) || live;
      if (!raw) {
        for (const sport of ALL_SPORTS) bySport[sport].push(modalidadeDe(sport) ? null : 0);
        bySport.best.push(0);
        hsSeries.push(0);
        sstSeries.push(0);
        thermalSeries.push(0);
        currentSpd.push(0);
        currentDir.push(0);
        windSpd.push(0);
        windDir.push(0);
        continue;
      }
      // kitesurf e surf: motor v6 (nota × 10, `null` de noite ou sem dados);
      // as outras no motor antigo até ao PR 6 (D5). `best` = máximo das
      // modalidades com número nesta hora (noite do v6 não entra).
      const scores = getAllSportScores(spot, rawToScoreInput(raw));
      const alvo = linhasV6(series, j, live, isNow, now.getTime());
      let best = 0;
      for (const sport of ALL_SPORTS) {
        const n = modalidadeDe(sport)
          ? scoreV6(spot, sport, alvo)
          : Math.max(0, Math.min(100, Math.round(scores[sport]?.score ?? 0)));
        bySport[sport].push(n);
        if (n != null && n > best) best = n;
      }
      bySport.best.push(best);
      const wh = Number(raw.waveHeight);
      const rounded = Number.isFinite(wh) ? Math.round(Math.max(0, wh) * 10) / 10 : 0;
      hsSeries.push(rounded);
      if (rounded > 0) hsFinite += 1;
      const sstRaw = Number(raw.waterTemp);
      const sstRounded = Number.isFinite(sstRaw) ? Math.round(sstRaw * 10) / 10 : 0;
      sstSeries.push(sstRounded);
      if (sstRounded >= 8) sstFinite += 1;
      const airRaw = Number(raw.airTemp);
      const kind = Number.isFinite(airRaw) && Number.isFinite(sstRaw)
        ? detectThermal({
            lisbonHour: lisbonHourFromMapTime(time),
            airTemp: airRaw,
            sst: sstRaw,
            windSpeedMs: Number(raw.windSpeed) || 0,
            windDirection: Number(raw.windDirection) || 0,
            coastOrientation: orientacaoVento(spot),
          })
        : null;
      thermalSeries.push(thermalCode(kind));
      if (kind) thermalFinite += 1;
      const spdRaw = Number(raw.currentSpeed);
      const dirRaw = Number(raw.currentDir);
      const spd = Number.isFinite(spdRaw) && spdRaw > 0 ? Math.round(spdRaw * 100) / 100 : 0;
      const dir = Number.isFinite(dirRaw) ? ((Math.round(dirRaw) % 360) + 360) % 360 : 0;
      currentSpd.push(spd);
      currentDir.push(dir);
      if (spd > 0.01) currentFinite += 1;
      const wSpdRaw = Number(raw.windSpeed);
      const wDirRaw = Number(raw.windDirection);
      const wSpd = Number.isFinite(wSpdRaw) && wSpdRaw > 0 ? Math.round(wSpdRaw * 100) / 100 : 0;
      const wDir = Number.isFinite(wDirRaw) ? ((Math.round(wDirRaw) % 360) + 360) % 360 : 0;
      windSpd.push(wSpd);
      windDir.push(wDir);
      if (wSpd > 0.01) windFinite += 1;
    }

    spots[spot.id] = bySport;
    hs[spot.id] = hsSeries;
    sst[spot.id] = sstSeries;
    thermal[spot.id] = thermalSeries;
    currents[spot.id] = { spd: currentSpd, dir: currentDir };
    wind[spot.id] = { spd: windSpd, dir: windDir };
  }

  const tides = buildMapTides(opts.spots, opts.forecasts, now);

  return {
    generatedAt: opts.generatedAt ?? now.toISOString(),
    stepHours: MAP_HOURS_STEP,
    times,
    sports: [...ALL_SPORTS],
    spots,
    ...(tides ? { tides } : {}),
    ...(hsFinite > 0 ? { hs } : {}),
    ...(sstFinite > 0 ? { sst } : {}),
    ...(thermalFinite > 0 ? { thermal } : {}),
    ...(currentFinite > 0 ? { currents } : {}),
    ...(windFinite > 0 ? { wind } : {}),
  };
}

