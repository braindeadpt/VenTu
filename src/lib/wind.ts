/**
 * Wind direction relation utilities.
 *
 * Shared logic between WindCompass and SwellRadar for determining
 * whether wind is offshore, onshore, or cross-shore relative to a
 * given coastline orientation.
 *
 * All directions follow the meteorological convention: a value is the
 * direction the wind COMES FROM.  Example: direction=0 means wind
 * blowing from North towards South.
 *
 * coastOrientation is the normal of the coast pointing TOWARDS the sea.
 * Example: a beach facing West has coastOrientation=270.
 *
 * @example
 * getWindRelationToCoast(0, 270)    // wind from N, coast W → 'cross'
 * @example
 * getWindRelationToCoast(90, 270)   // wind from E, coast W → 'offshore'
 * @example
 * getWindRelationToCoast(270, 270)  // wind from W, coast W → 'onshore'
 */

export type WindRelation = 'offshore' | 'onshore' | 'cross';

/**
 * Determine whether wind is offshore, onshore, or cross-shore.
 *
 * @param windDirection — degrees (0–360), where the wind COMES FROM
 * @param coastOrientation — degrees (0–360), coast normal pointing to sea
 * @returns WindRelation — 'offshore' | 'onshore' | 'cross'
 */
export function getWindRelationToCoast(
  windDirection: number,
  coastOrientation: number,
): WindRelation {
  const angleDiff = ((windDirection - coastOrientation + 540) % 360) - 180;
  const absDiff = Math.abs(angleDiff);
  if (absDiff < 67.5) return 'onshore';
  if (absDiff > 112.5) return 'offshore';
  return 'cross';
}

const WIND_RELATION_STYLES: Record<WindRelation, string> = {
  offshore: 'text-windDir-offshore border-windDir-offshore/30 bg-windDir-offshore/10',
  onshore: 'text-windDir-onshore border-windDir-onshore/30 bg-windDir-onshore/10',
  cross: 'text-windDir-cross border-divider bg-surface-2/[0.08]',
};

export function getWindRelationLabel(
  relation: WindRelation,
  locale: string,
): { label: string; className: string } {
  const t = getTranslation(locale).wind;
  return {
    label:
      relation === 'offshore'
        ? t.relOffshoreCap
        : relation === 'onshore'
          ? t.relOnshoreCap
          : t.relCrossCap,
    className: WIND_RELATION_STYLES[relation],
  };
}

/** Dot colour matching map wind-ring arc tokens. */
export function getWindRelationDotClass(relation: WindRelation): string {
  if (relation === 'offshore') return 'bg-windDir-offshore';
  if (relation === 'onshore') return 'bg-windDir-onshore';
  return 'bg-windDir-cross';
}

/**
 * Map a direction in degrees to its nearest cardinal / intercardinal label.
 */
export function getCardinalLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

const CARDINAL_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/**
 * Does `deg` fall inside one of the cardinal sectors of `list` (each ±22.5°)?
 * `list` is a spot's cardinal spec like «W, NW». Non-cardinal tokens («Rio»,
 * «Lagoa») are ignored; returns null when no cardinal is present at all.
 */
export function directionInSectorList(deg: number, list?: string): boolean | null {
  if (!list) return null;
  const degs = list
    .split(/[,/]/)
    .map((s) => CARDINAL_DEG[s.trim().toUpperCase()])
    .filter((d): d is number => d !== undefined);
  if (!degs.length) return null;
  return degs.some(
    (d) => Math.abs(((deg - d + 540) % 360) - 180) <= 22.5 + 1,
  );
}

/**
 * Map a wind direction (degrees, meteorological convention) to an arrow
 * pointing WHERE the wind GOES.
 *
 * @example
 * getWindArrow(0)   // '↓' — wind from North → blows South
 * @example
 * getWindArrow(90)  // '←' — wind from East → blows West
 * @example
 * getWindArrow(270) // '↑' — wind from West → blows East
 */
export function getWindArrow(direction: number): string {
  const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
  const snapped = ((Math.round(direction / 45) * 45) % 360 + 360) % 360;
  const index = snapped / 45;
  return arrows[index];
}import { getTranslation } from '@/lib/i18n';

