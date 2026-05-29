/**
 * Tide schedule for athletes: phase + next high/low times (no raw gauge heights).
 * Uses hourly sea_level from Open-Meteo (forecasts.json / conditions).
 */

export type TidePhase = 'high' | 'low' | 'rising' | 'falling';

export interface TideHourPoint {
  time: string;
  tideHeight?: number;
}

export interface TideEvent {
  type: 'high' | 'low';
  at: Date;
}

export interface TideSchedule {
  phase: TidePhase;
  phaseLabel: string;
  nextHigh: Date | null;
  nextLow: Date | null;
}

const PHASE_LABELS: Record<TidePhase, { pt: string; en: string }> = {
  high: { pt: 'Maré alta agora', en: 'High tide now' },
  low: { pt: 'Maré baixa agora', en: 'Low tide now' },
  rising: { pt: 'Maré a subir', en: 'Rising tide' },
  falling: { pt: 'Maré a descer', en: 'Falling tide' },
};

const EXTREMA_WINDOW = 2;
const MIN_EXTREMA_DELTA = 0.06;

function parseTime(iso: string): Date {
  return new Date(iso);
}

/** Local maxima/minima on hourly curve (MSL-relative metres). */
export function findTideExtrema(points: TideHourPoint[]): TideEvent[] {
  const series = points
    .filter((p) => typeof p.tideHeight === 'number' && !Number.isNaN(p.tideHeight))
    .map((p) => ({ time: p.time, h: p.tideHeight as number }));

  if (series.length < 3) return [];

  const raw: TideEvent[] = [];

  for (let i = 0; i < series.length; i += 1) {
    const lo = Math.max(0, i - EXTREMA_WINDOW);
    const hi = Math.min(series.length - 1, i + EXTREMA_WINDOW);
    if (hi - lo < 2) continue;

    const { h: curr, time } = series[i];
    let isHigh = true;
    let isLow = true;
    let minOther = Infinity;
    let maxOther = -Infinity;

    for (let j = lo; j <= hi; j += 1) {
      if (j === i) continue;
      const h = series[j].h;
      if (h >= curr) isHigh = false;
      if (h <= curr) isLow = false;
      minOther = Math.min(minOther, h);
      maxOther = Math.max(maxOther, h);
    }

    if (isHigh && curr - minOther >= MIN_EXTREMA_DELTA) {
      raw.push({ type: 'high', at: parseTime(time) });
    }
    if (isLow && maxOther - curr >= MIN_EXTREMA_DELTA) {
      raw.push({ type: 'low', at: parseTime(time) });
    }
  }

  // Merge duplicate consecutive types (keep stronger extremum)
  const merged: TideEvent[] = [];
  for (const ev of raw) {
    const last = merged[merged.length - 1];
    if (!last || last.type !== ev.type) {
      merged.push(ev);
      continue;
    }
    const prevH = series.find((s) => parseTime(s.time).getTime() === last.at.getTime())?.h ?? 0;
    const currH = series.find((s) => parseTime(s.time).getTime() === ev.at.getTime())?.h ?? 0;
    if (ev.type === 'high' ? currH > prevH : currH < prevH) {
      merged[merged.length - 1] = ev;
    }
  }

  return merged;
}

function inferPhase(
  points: TideHourPoint[],
  now: Date,
  fallback?: TidePhase,
): TidePhase {
  if (fallback) return fallback;

  const series = points
    .filter((p) => typeof p.tideHeight === 'number')
    .map((p) => ({ t: parseTime(p.time).getTime(), h: p.tideHeight as number }))
    .sort((a, b) => a.t - b.t);

  let idx = series.findIndex((s) => s.t >= now.getTime());
  if (idx === -1) idx = series.length - 1;
  if (idx < 1) idx = 1;

  const curr = series[idx]?.h ?? 0;
  const next = series[idx + 1]?.h ?? curr;
  const prev = series[idx - 1]?.h ?? curr;

  if (curr > 0.25 && curr >= prev && curr >= next) return 'high';
  if (curr < -0.25 && curr <= prev && curr <= next) return 'low';
  if (next > curr) return 'rising';
  if (next < curr) return 'falling';
  return curr >= 0 ? 'high' : 'low';
}

export function buildTideSchedule(
  hourly: TideHourPoint[],
  options: {
    now?: Date;
    locale?: 'pt' | 'en';
    phaseOverride?: TidePhase;
  } = {},
): TideSchedule | null {
  const series = hourly.filter((p) => typeof p.tideHeight === 'number');
  if (series.length < 2) return null;

  const now = options.now ?? new Date();
  const locale = options.locale ?? 'pt';
  const extrema = findTideExtrema(series);
  const nowMs = now.getTime();

  const phase = inferPhase(series, now, options.phaseOverride);
  const phaseLabel = PHASE_LABELS[phase][locale];

  const nextHigh = extrema.find((e) => e.type === 'high' && e.at.getTime() > nowMs)?.at ?? null;
  const nextLow = extrema.find((e) => e.type === 'low' && e.at.getTime() > nowMs)?.at ?? null;

  return {
    phase,
    phaseLabel,
    nextHigh,
    nextLow,
  };
}

export function formatTideTime(date: Date, locale: 'pt' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  }).format(date);
}

export function formatTideScheduleLine(schedule: TideSchedule, locale: 'pt' | 'en'): string {
  const parts: string[] = [schedule.phaseLabel];

  if (schedule.nextLow) {
    parts.push(
      locale === 'pt'
        ? `Baixa às ${formatTideTime(schedule.nextLow, locale)}`
        : `Low at ${formatTideTime(schedule.nextLow, locale)}`,
    );
  }
  if (schedule.nextHigh) {
    parts.push(
      locale === 'pt'
        ? `Alta às ${formatTideTime(schedule.nextHigh, locale)}`
        : `High at ${formatTideTime(schedule.nextHigh, locale)}`,
    );
  }

  return parts.join(' · ');
}

/** Map conditions.json tideStatus to TidePhase */
export function phaseFromConditionsStatus(
  status?: 'high' | 'low' | 'rising' | 'falling',
): TidePhase | undefined {
  return status;
}
