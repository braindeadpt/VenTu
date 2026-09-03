import { DEFAULT_REGION } from '@/lib/gridFilters';
import { MAP_TIDE_DEFAULT_REGION, type MapTideCurve } from '@/lib/mapHours';
import {
  buildTideSchedule,
  formatTideTime,
  type TidePhase,
} from '@/lib/tideSchedule';

export interface MapTideChipModel {
  phase: TidePhase;
  nextTime: string | null;
  nextKind: 'high' | 'low' | null;
}

export function pickMapTideCurve(
  tides: Record<string, MapTideCurve> | undefined,
  region: string,
): MapTideCurve | null {
  if (!tides) return null;
  if (region && region !== DEFAULT_REGION && tides[region]) return tides[region];
  if (tides[MAP_TIDE_DEFAULT_REGION]) return tides[MAP_TIDE_DEFAULT_REGION];
  return Object.values(tides)[0] ?? null;
}

export function mapTideChipAt(
  curve: MapTideCurve,
  at: Date,
  locale: 'pt' | 'en' = 'pt',
): MapTideChipModel | null {
  const hourly = curve.times.map((time, i) => ({ time, tideHeight: curve.height[i] }));
  const schedule = buildTideSchedule(hourly, { now: at, locale });
  if (!schedule) return null;

  let nextKind: 'high' | 'low' | null = null;
  let nextDate: Date | null = null;
  if (schedule.phase === 'rising' || schedule.phase === 'low') {
    nextKind = 'high';
    nextDate = schedule.nextHigh ?? schedule.nextLow;
    if (!schedule.nextHigh && schedule.nextLow) nextKind = 'low';
  } else {
    nextKind = 'low';
    nextDate = schedule.nextLow ?? schedule.nextHigh;
    if (!schedule.nextLow && schedule.nextHigh) nextKind = 'high';
  }

  return {
    phase: schedule.phase,
    nextTime: nextDate ? formatTideTime(nextDate, locale) : null,
    nextKind: nextDate ? nextKind : null,
  };
}
