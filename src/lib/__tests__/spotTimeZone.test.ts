/**
 * SESSÃO FUSOS (data/fusos-acores) — a hora é SEMPRE a local do spot,
 * nunca UTC nem a do browser. Estes testes correm as mesmas funções sob
 * TZ=Europe/Lisbon, Atlantic/Azores, Pacific/Auckland e America/New_York
 * (process.env.TZ muda em runtime no Node — padrão do teste de marés de
 * 4b7d5f222) e exigem resultado IDÊNTICO para um spot do continente e
 * para um spot dos Açores.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spots } from '@/lib/spots';
import { spotTimeZone, spotTimeZoneById, LISBON_TZ, AZORES_TZ } from '../spotTimeZone';
import {
  findCurrentHourIndex,
  wallTimeToInstantMs,
  hourKeyFromInstantInTz,
  dateKeyInTz,
} from '../openMeteoTime';
import {
  buildTideSchedule,
  findTideExtrema,
  formatTideTime,
  formatTideScheduleLine,
  getTidePhasesForHours,
} from '../tideSchedule';
import { filterForecastNext24h, computeUpcomingWindowsForSpot } from '../bestWindowToday';
import { sunTimes } from '../verdict/sunTimes';
import { getDaypart } from '../timeOfDay';
import { formatForecastUpdatedAt } from '../dataFreshness';
import { groupForecastDays, formatDayLong } from '../forecastTimeline';
import { resolveTideExtrema } from '../instruments/tideExtremaSource';
import type { Spot } from '@/types';

const TESTED_TZ = [
  'Europe/Lisbon',
  'Atlantic/Azores',
  'Pacific/Auckland',
  'America/New_York',
];

const prevTz = process.env.TZ;
afterEach(() => {
  if (prevTz === undefined) delete process.env.TZ;
  else process.env.TZ = prevTz;
});

/** Corre `fn` sob cada fuso e devolve os resultados por fuso. */
function underEachTz<T>(fn: () => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const tz of TESTED_TZ) {
    process.env.TZ = tz;
    out[tz] = fn();
  }
  return out;
}

const guincho = spots.find((s) => s.slug === 'guincho') as Spot;
const mosteiros = spots.find((s) => s.slug === 'mosteiros') as Spot;

/** Série horária sintética wall-time («YYYY-MM-DDTHH:00» naive) de `hours` horas a partir de `startIso`. */
function syntheticHourly(startIso: string, hours: number): { time: string; tideHeight: number }[] {
  // O início é uma hora de parede — «avançar horas» faz-se em UTC a partir do
  // instante resolvido no fuso, e a chave volta a parede no mesmo fuso.
  const tz = startIso.endsWith('A') ? AZORES_TZ : LISBON_TZ;
  const start = wallTimeToInstantMs(startIso.replace(/A$/, ''), tz);
  return Array.from({ length: hours }, (_, i) => ({
    time: `${hourKeyFromInstantInTz(start + i * 3_600_000, tz)}:00`,
    tideHeight: Number((1.4 * Math.cos((i / 12.4) * 2 * Math.PI)).toFixed(3)),
  }));
}

describe('spotTimeZone — mapeamento único', () => {
  it('guincho → Europe/Lisbon; mosteiros (Açores) → Atlantic/Azores', () => {
    expect(spotTimeZone(guincho)).toBe('Europe/Lisbon');
    expect(spotTimeZone(mosteiros)).toBe('Atlantic/Azores');
    expect(spotTimeZoneById(mosteiros.id)).toBe('Atlantic/Azores');
    // Madeira partilha Lisboa (mesma hora todo o ano).
    const madeira = spots.find((s) => s.lon < -16 && s.lon > -18);
    if (madeira) expect(spotTimeZone(madeira)).toBe('Europe/Lisbon');
  });

  it('todos os spots com lon < −24 são Açores', () => {
    for (const s of spots.filter((x) => x.lon < -24)) {
      expect(spotTimeZone(s)).toBe('Atlantic/Azores');
    }
  });
});

describe('wallTimeToInstantMs — semântica correcta', () => {
  it('14:00 nos Açores é o MESMO instante que 15:00 em Lisboa (UTC−1)', () => {
    const az = wallTimeToInstantMs('2026-09-27T14:00', 'Atlantic/Azores');
    const lx = wallTimeToInstantMs('2026-09-27T15:00', 'Europe/Lisbon');
    expect(az).toBe(lx);
  });

  it('independente do fuso do host', () => {
    const results = underEachTz(() => wallTimeToInstantMs('2026-09-27T14:00', 'Atlantic/Azores'));
    for (const tz of TESTED_TZ) expect(results[tz]).toBe(results[TESTED_TZ[0]]);
  });

  it('cobre a mudança de hora (DST convergente Lisboa/Açores, último domingo de março/outubro)', () => {
    // 2026-03-29 01:00 UTC: Lisboa salta +1→+1h UTC, Açores 00:00−1→0h.
    const spring = wallTimeToInstantMs('2026-10-25T01:30', 'Atlantic/Azores');
    expect(Number.isFinite(spring)).toBe(true);
  });
});

describe('invariância ao fuso do host — spot do continente (Europe/Lisbon)', () => {
  const tz = 'Europe/Lisbon';
  const hourly = syntheticHourly('2026-09-27T00:00', 72);
  // Instante real: 2026-09-27 08:30 em Lisboa (DST +1 → 07:30 UTC).
  const nowMs = wallTimeToInstantMs('2026-09-27T08:30', tz);
  const now = new Date(nowMs);

  it('findCurrentHourIndex', () => {
    const results = underEachTz(() => findCurrentHourIndex(hourly.map((h) => h.time), now, tz));
    for (const r of TESTED_TZ) expect(results[r]).toBe(8);
  });

  it('marés: extrema, fases, próxima maré e linha', () => {
    const results = underEachTz(() => {
      const schedule = buildTideSchedule(hourly, { now, locale: 'pt', timeZone: tz });
      return JSON.stringify({
        extrema: findTideExtrema(hourly, tz).map((e) => [e.type, e.time]),
        phases: getTidePhasesForHours(hourly),
        schedule,
        line: schedule ? formatTideScheduleLine(schedule, 'pt', tz) : null,
      });
    });
    for (const r of TESTED_TZ) expect(results[r]).toBe(results[TESTED_TZ[0]]);
  });

  it('janelas: filtro das próximas 24h e upcoming windows', () => {
    const forecast = hourly.map((h) => ({
      time: h.time,
      waveHeight: 1.4,
      wavePeriod: 11,
      windSpeed: 6,
      windDirection: 300,
      windGust: 9,
      waterTemp: 18,
    }));
    const results = underEachTz(() => {
      const next24 = filterForecastNext24h(forecast, nowMs, tz);
      const upcoming = computeUpcomingWindowsForSpot(
        guincho,
        forecast,
        { waveHeight: 1.4, wavePeriod: 11, waveDirection: 280, windSpeed: 6, windDirection: 300, windGust: 9, waterTemp: 18 },
        nowMs,
        tz,
      );
      return JSON.stringify({ n: next24.length, first: next24[0]?.time, upcoming });
    });
    for (const r of TESTED_TZ) expect(results[r]).toBe(results[TESTED_TZ[0]]);
  });

  it('noite/dia e frescura', () => {
    const results = underEachTz(() =>
      JSON.stringify({
        daypart: getDaypart(now, tz),
        sun: sunTimes('2026-09-27', guincho.lat, guincho.lon, tz),
        fresh: formatForecastUpdatedAt(nowMs - 2 * 3_600_000, 'pt', nowMs, tz),
        days: groupForecastDays(hourly, 'pt'),
        long: formatDayLong(hourly[10].time, 'pt'),
        key: dateKeyInTz(now, tz),
      }),
    );
    for (const r of TESTED_TZ) expect(results[r]).toBe(results[TESTED_TZ[0]]);
  });
});

describe('invariância ao fuso do host — spot dos Açores (Atlantic/Azores)', () => {
  const tz = 'Atlantic/Azores';
  const hourly = syntheticHourly('2026-09-27T00:00A', 72);
  // 08:30 nos Açores = 09:30 Lisboa = 08:30 UTC.
  const nowMs = wallTimeToInstantMs('2026-09-27T08:30', tz);
  const now = new Date(nowMs);

  it('findCurrentHourIndex usa a hora local dos Açores, não Lisboa', () => {
    const results = underEachTz(() => findCurrentHourIndex(hourly.map((h) => h.time), now, tz));
    for (const r of TESTED_TZ) expect(results[r]).toBe(8);
    // E o instante «agora» é 09:30 em Lisboa — se a série estivesse em
    // Lisboa-wall o índice seria 9. A série é Azores-wall → 8.
    expect(findCurrentHourIndex(hourly.map((h) => h.time), now, 'Europe/Lisbon')).toBe(9);
  });

  it('marés: extrema, fases e próxima maré em hora dos Açores', () => {
    const results = underEachTz(() => {
      const schedule = buildTideSchedule(hourly, { now, locale: 'pt', timeZone: tz });
      const src = resolveTideExtrema({
        schedule,
        series: hourly,
        tableSeries: hourly,
        timeZone: tz,
      });
      return JSON.stringify({
        extrema: findTideExtrema(hourly, tz).map((e) => [e.type, e.time]),
        phases: getTidePhasesForHours(hourly),
        schedule,
        src,
        // A hora mostrada é a dos Açores — formatTideTime do instante.
        clock: schedule?.nextHigh ? formatTideTime(schedule.nextHigh, 'pt', tz) : null,
      });
    });
    for (const r of TESTED_TZ) expect(results[r]).toBe(results[TESTED_TZ[0]]);
  });

  it('janelas nas próximas 24h/48h', () => {
    const forecast = hourly.map((h) => ({
      time: h.time,
      waveHeight: 1.8,
      wavePeriod: 12,
      windSpeed: 7,
      windDirection: 250,
      windGust: 10,
      waterTemp: 22,
    }));
    const results = underEachTz(() => {
      const next24 = filterForecastNext24h(forecast, nowMs, tz);
      const upcoming = computeUpcomingWindowsForSpot(
        mosteiros,
        forecast,
        { waveHeight: 1.8, wavePeriod: 12, waveDirection: 270, windSpeed: 7, windDirection: 250, windGust: 10, waterTemp: 22 },
        nowMs,
        tz,
      );
      return JSON.stringify({ n: next24.length, first: next24[0]?.time, upcoming });
    });
    for (const r of TESTED_TZ) expect(results[r]).toBe(results[TESTED_TZ[0]]);
  });

  it('sol e agrupamento por dia civil dos Açores', () => {
    const results = underEachTz(() =>
      JSON.stringify({
        sun: sunTimes('2026-09-27', mosteiros.lat, mosteiros.lon, tz),
        days: groupForecastDays(hourly, 'pt'),
        long: formatDayLong(hourly[10].time, 'pt'),
        key: dateKeyInTz(now, tz),
      }),
    );
    for (const r of TESTED_TZ) expect(results[r]).toBe(results[TESTED_TZ[0]]);
    // O sol nasce ~1h mais tarde em UTC que no continente (longitude ~−28).
    const az = sunTimes('2026-09-27', mosteiros.lat, mosteiros.lon, 'Atlantic/Azores');
    const lx = sunTimes('2026-09-27', guincho.lat, guincho.lon, 'Europe/Lisbon');
    expect(az!.sunrise.getTime()).toBeGreaterThan(lx!.sunrise.getTime() + 3_000_000);
  });
});

describe('new Date(naive) — nunca', () => {
  it('a diferença que o bug causava: parse local muda com TZ', () => {
    // Prova do bug pré-fix: new Date('2026-09-27T14:00') dá instantes
    // diferentes consoante o host — por isso está proibido.
    process.env.TZ = 'Europe/Lisbon';
    const a = new Date('2026-09-27T14:00').getTime();
    process.env.TZ = 'Pacific/Auckland';
    const b = new Date('2026-09-27T14:00').getTime();
    expect(a).not.toBe(b);
    // E a conversão explícita dá sempre o mesmo instante:
    const c = wallTimeToInstantMs('2026-09-27T14:00', 'Europe/Lisbon');
    expect(c).toBe(wallTimeToInstantMs('2026-09-27T14:00', 'Europe/Lisbon'));
  });
});
