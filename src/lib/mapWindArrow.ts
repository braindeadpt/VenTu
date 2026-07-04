/**
 * Wind vectors for Leaflet spot markers.
 *
 * Convention (Windy / WindCompass):
 * - Meteorological direction = where wind COMES FROM.
 * - Arrow points WHERE wind blows (tip = destination, tail dot = spot).
 */

import { getCardinalLabel } from '@/lib/wind';

export const WIND_ARROW_VIEWBOX = 36;
export const WIND_ARROW_MIN_PX = 36;
export const WIND_ARROW_MAX_PX = 52;
const WIND_ARROW_BASE_ZOOM = 8;

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Speed ramp — always saturated enough for dark satellite tiles. */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [56, 189, 248];   /* sky-400 — calm but visible */
  if (speedKt < 14) return [34, 197, 94];   /* green */
  if (speedKt < 20) return [6, 182, 212];   /* cyan */
  if (speedKt < 28) return [167, 139, 250]; /* violet */
  if (speedKt < 36) return [251, 191, 36];  /* amber */
  return [248, 113, 113];                   /* red */
}

/** Shaft length encodes speed (kt). */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 8;
  if (speedKt < 12) return 11;
  if (speedKt < 20) return 14;
  if (speedKt < 30) return 17;
  return 20;
}

export function windArrowPxForZoom(zoom: number): number {
  if (zoom <= WIND_ARROW_BASE_ZOOM) return WIND_ARROW_MIN_PX;
  const t = Math.min(1, (zoom - WIND_ARROW_BASE_ZOOM) / 5);
  return Math.round(WIND_ARROW_MIN_PX + t * (WIND_ARROW_MAX_PX - WIND_ARROW_MIN_PX));
}

export function markerWindArrowLayout(showWind: boolean): {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
} {
  if (!showWind) {
    return {
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -46],
    };
  }

  const arrowPx = WIND_ARROW_MAX_PX;
  const markerW = Math.max(44, arrowPx + 8);
  const h = arrowPx + 4 + 34 + 8;
  const anchorX = Math.round(markerW / 2);

  return {
    iconSize: [markerW, h],
    iconAnchor: [anchorX, h],
    popupAnchor: [0, -h],
  };
}

export function buildMapWindArrowTitle(fromDeg: number, speedKt: number, locale: string): string {
  const card = getCardinalLabel(fromDeg);
  const kt = Math.round(speedKt);
  return locale === 'pt'
    ? `${kt} kt de ${card} · seta indica para onde sopra`
    : `${kt} kt from ${card} · arrow shows flow direction`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** High-contrast vector: white halo + coloured core; pivots at spot anchor. */
export function buildMapWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const shaft = windArrowShaftLength(speedKt);
  const color = windArrowColorRgb(speedKt);
  const size = WIND_ARROW_VIEWBOX;
  const cx = size / 2;
  const yAnchor = size - 3;
  const yTip = yAnchor - shaft;
  const headHalf = 4;
  const outline = 'rgba(15,23,42,0.92)';
  const halo = 'rgba(255,255,255,0.98)';
  const fill = `rgb(${color.join(',')})`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <g transform="rotate(${rot} ${cx} ${yAnchor})">
        <circle cx="${cx}" cy="${yAnchor}" r="3" fill="${outline}"/>
        <circle cx="${cx}" cy="${yAnchor}" r="2.1" fill="${halo}"/>
        <circle cx="${cx}" cy="${yAnchor}" r="1.4" fill="${fill}"/>
        <line x1="${cx}" y1="${yAnchor - 0.5}" x2="${cx}" y2="${yTip + 2}" stroke="${outline}" stroke-width="5" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yAnchor - 0.5}" x2="${cx}" y2="${yTip + 2}" stroke="${halo}" stroke-width="3.25" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yAnchor - 0.5}" x2="${cx}" y2="${yTip + 2}" stroke="${fill}" stroke-width="2.25" stroke-linecap="round"/>
        <path d="M${cx} ${yTip - 1} L${cx - headHalf - 0.5} ${yTip + 5} H${cx + headHalf + 0.5} Z" fill="${outline}"/>
        <path d="M${cx} ${yTip - 1} L${cx - headHalf} ${yTip + 4.5} H${cx + headHalf} Z" fill="${fill}"/>
      </g>
    </svg>
  `.trim();
}

export function buildMapWindArrowHtml(fromDeg: number, speedKt: number, locale: string): string {
  const title = escapeHtmlAttr(buildMapWindArrowTitle(fromDeg, speedKt, locale));
  return `<div class="ventu-wind-arrow" title="${title}">${buildMapWindArrowSvg(fromDeg, speedKt)}</div>`;
}
