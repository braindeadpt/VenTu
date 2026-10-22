'use strict';
/**
 * Open-Meteo em UTC, convertido hora a hora para o fuso do spot (auditoria M1/B3).
 *
 * Com `timezone=Europe/Lisbon` o Open-Meteo aplica UM só `utc_offset_seconds`
 * a toda a resposta: um pedido feito a 19/10 (WEST, +01:00) etiqueta as horas
 * depois da mudança de 25/10 com +01:00 (1 h tarde) e nunca devolve o 01:00
 * repetido. E os Açores levavam etiquetas de Lisboa.
 *
 * Aqui pede-se sempre `timezone=GMT&timeformat=unixtime` com uma janela
 * explícita (`start_hour`/`end_hour`, em UTC) que cobre os dias LOCAIS do spot
 * (hoje 00:00 → hoje+N 00:00, exclusivo), e cada instante é convertido com o
 * desvio real dessa hora:
 *
 *   1792890000 → "2026-10-25T01:00+01:00"   (WEST)
 *   1792893600 → "2026-10-25T01:00+00:00"   (WET, o 01:00 repetido)
 *
 * O formato de `time` passa a ser ISO 8601 com desvio. Os 16 primeiros
 * caracteres continuam a ser a hora de parede do spot (`slice(0, 13)`,
 * `slice(0, 10)`, `slice(11, 16)` não mudam) e `Date.parse` dá o instante certo.
 */

const LISBON_TZ = 'Europe/Lisbon';
const AZORES_TZ = 'Atlantic/Azores';
const MADEIRA_TZ = 'Atlantic/Madeira';
const HOUR_MS = 3_600_000;

/** Fuso de parede do spot: Açores e Madeira pela mesma caixa geográfica de `islandSpots.js`. */
function spotTimeZone(spot) {
  const lat = Number(spot?.lat);
  const lon = Number(spot?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return LISBON_TZ;
  if (lat >= 36.5 && lat <= 40.2 && lon >= -31.6 && lon <= -24.4) return AZORES_TZ;
  if (lat >= 32.2 && lat <= 33.4 && lon >= -17.7 && lon <= -15.8) return MADEIRA_TZ;
  return LISBON_TZ;
}

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function wallParts(ms, tz) {
  const p = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return p;
}

/** Desvio do fuso face a UTC (minutos) no instante `ms`. */
function offsetMinutes(ms, tz) {
  const p = wallParts(ms, tz);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((wall - Math.floor(ms / 60000) * 60000) / 60000);
}

function fmtOffset(min) {
  const s = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Instante (ms) → `YYYY-MM-DDTHH:MM±hh:mm` na hora de parede de `tz`. */
function localIso(ms, tz = LISBON_TZ) {
  const p = wallParts(ms, tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}${fmtOffset(offsetMinutes(ms, tz))}`;
}

/** Hora de parede (componentes) em `tz` → instante (ms); duas passagens chegam para as mudanças de hora. */
function wallToUtcMs(y, mo, d, h, mi, tz) {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let off = offsetMinutes(wall, tz);
  off = offsetMinutes(wall - off * 60000, tz);
  return wall - off * 60000;
}

/** Janela [hoje 00:00, hoje+days 00:00) local de `tz`, em ms UTC. */
function localDaysWindow(nowMs, tz, days) {
  const p = wallParts(nowMs, tz);
  const start = wallToUtcMs(+p.year, +p.month, +p.day, 0, 0, tz);
  const end = wallToUtcMs(+p.year, +p.month, +p.day + days, 0, 0, tz);
  return { startMs: start, endMs: end };
}

const utcHour = (ms) => new Date(ms).toISOString().slice(0, 16);

/**
 * Parâmetros de pedido em UTC para `days` dias locais do fuso `tz`.
 * (`start_hour`/`end_hour` são inclusivos e vêm no fuso pedido, aqui GMT.)
 */
function utcRequestParams({ tz = LISBON_TZ, nowMs = Date.now(), days = 7 } = {}) {
  const { startMs, endMs } = localDaysWindow(nowMs, tz, days);
  return {
    timezone: 'GMT',
    timeformat: 'unixtime',
    start_hour: utcHour(startMs),
    end_hour: utcHour(endMs - HOUR_MS),
  };
}

/**
 * Converte `hourly.time` (unixtime, s) de uma resposta Open-Meteo em ISO com
 * desvio no fuso `tz`. Muta e devolve `json`. Respostas já em texto ficam como estão.
 */
function localizeHourly(json, tz = LISBON_TZ) {
  const times = json?.hourly?.time;
  if (!Array.isArray(times) || !times.length || typeof times[0] !== 'number') return json;
  json.hourly.time = times.map((s) => localIso(s * 1000, tz));
  json.timezone = tz;
  json.timeSource = 'utc';
  return json;
}

/**
 * Instante (ms) de uma etiqueta de série: com desvio/Z → `Date.parse`;
 * sem desvio (formato antigo) → hora de parede de Lisboa.
 */
function seriesTimeMs(t) {
  if (typeof t === 'number') return t < 1e11 ? t * 1000 : t;
  const s = String(t ?? '').trim();
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s)) return Date.parse(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return NaN;
  return wallToUtcMs(+m[1], +m[2], +m[3], +m[4], +(m[5] || 0), LISBON_TZ);
}

module.exports = {
  LISBON_TZ,
  AZORES_TZ,
  MADEIRA_TZ,
  spotTimeZone,
  offsetMinutes,
  localIso,
  localDaysWindow,
  utcRequestParams,
  localizeHourly,
  seriesTimeMs,
  wallToUtcMs,
};
