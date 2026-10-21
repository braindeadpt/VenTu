/**
 * Etiquetas horárias das séries (forecasts do pipeline e pedidos do cliente).
 *
 * Desde a auditoria M1 o pipeline pede o Open-Meteo em UTC e grava a hora de
 * parede do spot COM desvio: `2026-10-25T01:00+01:00` e `2026-10-25T01:00+00:00`
 * (o 01:00 repetido da mudança de hora), `2026-10-16T11:00-01:00` nos Açores.
 * Os 16 primeiros caracteres continuam a ser a hora de parede (etiqueta); o
 * instante sai do desvio. Etiquetas antigas sem desvio são lidas como hora de
 * parede de Lisboa.
 */

const LISBON_TZ = 'Europe/Lisbon';
const HOUR_MS = 3_600_000;

let fmtLisboa: Intl.DateTimeFormat | null = null;
function partsLisboa(date: Date): Record<string, string> {
  fmtLisboa ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const p of fmtLisboa.formatToParts(date)) out[p.type] = p.value;
  return out;
}

export function lisbonHourKeyFromDate(date: Date): string {
  const p = partsLisboa(date);
  const pick = (k: string) => p[k] ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}`;
}

export function hourKeyFromOpenMeteo(iso: string): string {
  return iso.slice(0, 13);
}

/**
 * Hora de parede (0–23) de uma etiqueta: a da própria etiqueta (`…T21:00+01:00`,
 * `…T21:00`); instantes em `Z` (mocks, toISOString) passam para Lisboa.
 */
export function wallHourOf(t: string): number {
  const s = String(t ?? '').trim();
  const h = /[zZ]$/.test(s)
    ? Number(lisbonHourKeyFromDate(new Date(s)).slice(-2))
    : Number(s.slice(11, 13));
  return Number.isFinite(h) ? h : 0;
}

/** A etiqueta traz desvio (`Z`, `+01:00`, `-0100`)? */
export function hasOffset(t: string): boolean {
  return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(t.trim());
}

function desvioLisboaMin(ms: number): number {
  const p = partsLisboa(new Date(ms));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((wall - Math.floor(ms / 60000) * 60000) / 60000);
}

/**
 * Instante (ms UTC) de uma etiqueta da série: com desvio → `Date.parse`;
 * sem desvio → hora de parede de Lisboa (duas passagens para a mudança de hora).
 */
export function seriesTimeMs(t: string): number {
  const s = String(t ?? '').trim();
  if (hasOffset(s)) return Date.parse(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +(m[5] ?? 0));
  let off = desvioLisboaMin(wall);
  off = desvioLisboaMin(wall - off * 60000);
  return wall - off * 60000;
}

/** Instante (ms) → `YYYY-MM-DDTHH:MM±hh:mm` na hora de parede de Lisboa (desvio real dessa hora). */
export function lisbonIsoWithOffset(ms: number): string {
  const p = partsLisboa(new Date(ms));
  const off = desvioLisboaMin(ms);
  const a = Math.abs(off);
  const o = `${off < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}${o}`;
}

/** As duas etiquetas são a mesma hora real? (por instante, não por texto) */
export function sameSeriesHour(a: string, b: string): boolean {
  const x = seriesTimeMs(a);
  const y = seriesTimeMs(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.floor(x / HOUR_MS) === Math.floor(y / HOUR_MS);
}

function hourKeyToHourOffset(key: string): number {
  const [date, hour] = key.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = Number(hour);
  // Compare wall-time keys using the real calendar, without interpreting
  // offset-less Open-Meteo timestamps in the device's timezone.
  return Date.UTC(y, m - 1, d, h) / 3_600_000;
}

/** Exact current hour (by instant), or -1 when the series does not cover now. */
export function findCoveredHourIndex(times: readonly string[], now = new Date()): number {
  const ms = now.getTime();
  for (let i = 0; i < times.length; i++) {
    const t = seriesTimeMs(times[i]);
    if (Number.isFinite(t) && ms >= t && ms < t + HOUR_MS) return i;
  }
  return -1;
}

/** Index of the hourly slot containing `now` (by instant), or the closest one. */
export function findCurrentHourIndex(times: string[], now = new Date()): number {
  if (!times.length) return 0;

  const covered = findCoveredHourIndex(times, now);
  if (covered >= 0) return covered;

  const ms = now.getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = seriesTimeMs(times[i]);
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - ms);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  if (bestDiff === Infinity) {
    // etiquetas ilegíveis: comportamento antigo, por chave de Lisboa
    const nowOff = hourKeyToHourOffset(lisbonHourKeyFromDate(now));
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(hourKeyToHourOffset(hourKeyFromOpenMeteo(times[i])) - nowOff);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
  }
  return best;
}
