/**
 * IPMA weather warnings + radar link (baked data from scripts/fetch-ipma-warnings.js).
 * Types and labels shared by the spot warnings section and the Dawn Patrol banner.
 */

export type IpmaWarningLevel = 'yellow' | 'orange' | 'red';

export interface IpmaWarning {
  areaCode: string;
  areaLabel: string;
  type: string;
  level: IpmaWarningLevel;
  text: string;
  startTime?: string;
  endTime?: string;
  relevant: boolean;
}

export interface IpmaWarningsData {
  /** 'ipma' | 'meteoalarm' — which service produced warnings.json. */
  source?: 'ipma' | 'meteoalarm';
  fetchedAt: string;
  warnings: IpmaWarning[];
  spotWarnings: Record<string, IpmaWarning[]>;
}

/** Human label for the warnings source (spot section + Dawn Patrol). */
export function warningsSourceLabel(data: IpmaWarningsData | null | undefined, isPt: boolean): string {
  const source = data?.source ?? 'ipma';
  if (source === 'meteoalarm') {
    return isPt ? 'MeteoAlarm (EUMETNET)' : 'MeteoAlarm (EUMETNET)';
  }
  return isPt ? 'IPMA' : 'IPMA';
}

/** IPMA PT type name → { pt, en } label. */
export const WARNING_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  'Agitação Marítima': { pt: 'Agitação marítima', en: 'Sea state' },
  Vento: { pt: 'Vento', en: 'Wind' },
  Trovoada: { pt: 'Trovoada', en: 'Thunderstorms' },
  Precipitação: { pt: 'Precipitação', en: 'Precipitation' },
  Nevoeiro: { pt: 'Nevoeiro', en: 'Fog' },
  'Tempo Quente': { pt: 'Tempo quente', en: 'Hot weather' },
  'Tempo Frio': { pt: 'Tempo frio', en: 'Cold weather' },
  Neve: { pt: 'Neve', en: 'Snow' },
};

export const WARNING_LEVEL_META: Record<
  IpmaWarningLevel,
  { label: { pt: string; en: string }; chipClass: string }
> = {
  yellow: {
    label: { pt: 'Amarelo', en: 'Yellow' },
    chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
  },
  orange: {
    label: { pt: 'Laranja', en: 'Orange' },
    chipClass: 'bg-score-poor/15 text-score-poor border-score-poor/40',
  },
  red: {
    label: { pt: 'Vermelho', en: 'Red' },
    chipClass: 'bg-red-500/15 text-red-500 border-red-500/40',
  },
};

/** Water-sports relevant warning types (the spot section shows only these). */
export const RELEVANT_WARNING_TYPES = new Set([
  'Agitação Marítima',
  'Vento',
  'Trovoada',
  'Precipitação',
  'Nevoeiro',
]);

/** Sea-state warnings (dangerous sea) — drive the safety banner in the hero. */
export const SEA_STATE_WARNING_TYPES = new Set(['Agitação Marítima']);

/**
 * Warning types that get a badge on map markers / home cards — sea state and
 * wind are the two that directly threaten a water-sports session.
 */
export const MAP_WARNING_TYPES = new Set(['Agitação Marítima', 'Vento']);

const WARNING_LEVEL_RANK: Record<IpmaWarningLevel, number> = {
  red: 3,
  orange: 2,
  yellow: 1,
};

/**
 * Strongest sea-state warning (Agitação Marítima) for a spot — the one that
 * justifies a "dangerous sea — do not surf" safety banner in the hero.
 * Red > orange > yellow; null when none active.
 */
export function seaStateWarningForSpot(
  data: IpmaWarningsData | null | undefined,
  spotId: string,
): IpmaWarning | null {
  const list = data?.spotWarnings?.[spotId];
  if (!Array.isArray(list)) return null;
  const candidates = list.filter((w) => SEA_STATE_WARNING_TYPES.has(w.type));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, w) => {
    const rankDiff = WARNING_LEVEL_RANK[w.level] - WARNING_LEVEL_RANK[best.level];
    if (rankDiff > 0) return w;
    if (rankDiff < 0) return best;
    return w.type.localeCompare(best.type) <= 0 ? w : best;
  });
}

/**
 * Compact badge label for map cards / home cards / Dawn Patrol. Sea state
 * reads as the stronger «Mar perigoso» (the hero safety banner wording);
 * wind and the other types keep the type label.
 */
export function warningBadgeLabel(
  warning: { type: string } | null | undefined,
  isPt: boolean,
): string {
  if (!warning) return '';
  if (SEA_STATE_WARNING_TYPES.has(warning.type)) {
    return isPt ? 'Mar perigoso' : 'Dangerous sea';
  }
  return warningTypeLabel(warning.type, isPt);
}

/**
 * Strongest sea-state warning across a list of spot ids (Dawn Patrol briefing
 * covers several spots) — red > orange > yellow. Null when none active.
 */
export function strongestSeaStateForSpots(
  data: IpmaWarningsData | null | undefined,
  spotIds: string[],
): IpmaWarning | null {
  let best: IpmaWarning | null = null;
  for (const id of spotIds) {
    const w = seaStateWarningForSpot(data, id);
    if (!w) continue;
    if (!best || WARNING_LEVEL_RANK[w.level] > WARNING_LEVEL_RANK[best.level]) {
      best = w;
    }
  }
  return best;
}

/**
 * Strongest sea-state/wind warning for a spot (red > orange > yellow,
 * tie → alphabetical type). Returns null when none active — the badge is
 * never shown for irrelevant or missing warnings.
 */
export function strongestSpotWarning(
  data: IpmaWarningsData | null | undefined,
  spotId: string,
): IpmaWarning | null {
  const list = data?.spotWarnings?.[spotId];
  if (!Array.isArray(list)) return null;
  const candidates = list.filter((w) => MAP_WARNING_TYPES.has(w.type));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, w) => {
    const rankDiff = WARNING_LEVEL_RANK[w.level] - WARNING_LEVEL_RANK[best.level];
    if (rankDiff > 0) return w;
    if (rankDiff < 0) return best;
    return w.type.localeCompare(best.type) <= 0 ? w : best;
  });
}

export function ipmaRadarUrl(locale: string): string {
  return locale === 'pt'
    ? 'https://www.ipma.pt/pt/otempo/obs.radar/'
    : 'https://www.ipma.pt/en/otempo/obs.radar/';
}

export function warningTypeLabel(type: string, isPt: boolean): string {
  return WARNING_TYPE_LABELS[type]?.[isPt ? 'pt' : 'en'] ?? type;
}

export function relevantWarningsForSpot(
  data: IpmaWarningsData | null | undefined,
  spotId: string,
): IpmaWarning[] {
  const list = data?.spotWarnings?.[spotId];
  if (!Array.isArray(list)) return [];
  return list.filter((w) => RELEVANT_WARNING_TYPES.has(w.type));
}
