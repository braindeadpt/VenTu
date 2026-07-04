/**
 * Windy-style spot wind vectors for Leaflet markers.
 *
 * Convention (same as Windy reported wind & WindCompass):
 * - Meteorological direction = where wind COMES FROM.
 * - Arrow points WHERE wind blows (tip = destination, tail dot = origin).
 */

import { getCardinalLabel } from '@/lib/wind';

export const WIND_ARROW_VIEWBOX = 40;
export const WIND_ARROW_MIN_PX = 30;
export const WIND_ARROW_MAX_PX = 48;
const WIND_ARROW_BASE_ZOOM = 9;
const ANCHOR_Y = 36;

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Windy-inspired speed ramp — calm (slate) → fresh (violet) → strong (red). */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 5) return [100, 116, 139];
  if (speedKt < 10) return [34, 197, 94];
  if (speedKt < 16) return [6, 182, 212];
  if (speedKt < 22) return [139, 92, 246];
  if (speedKt < 30) return [245, 158, 11];
  return [239, 68, 68];
}

function rgb([r, g, b]: [number, number, number], alpha = 1): string {
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/** Shaft length encodes speed (kt) — always full opacity for map legibility. */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 9;
  if (speedKt < 12) return 12;
  if (speedKt < 20) return 15;
  if (speedKt < 30) return 18;
  return 21;
}

/** Arrow display size grows with zoom so close-up views stay legible on satellite tiles. */
export function windArrowPxForZoom(zoom: number): number {
  if (zoom <= WIND_ARROW_BASE_ZOOM) return WIND_ARROW_MIN_PX;
  const t = Math.min(1, (zoom - WIND_ARROW_BASE_ZOOM) / 4);
  return Math.round(WIND_ARROW_MIN_PX + t * (WIND_ARROW_MAX_PX - WIND_ARROW_MIN_PX));
}

/** Leaflet DivIcon dimensions — sized for max arrow so high zoom never clips. */
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
  const markerW = Math.max(44, arrowPx + 6);
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

/** Windy-style vector: origin dot + halo shaft + coloured head; pivots at spot anchor. */
export function buildMapWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const shaft = windArrowShaftLength(speedKt);
  const color = windArrowColorRgb(speedKt);
  const size = WIND_ARROW_VIEWBOX;
  const cx = size / 2;
  const yAnchor = ANCHOR_Y;
  const yTip = yAnchor - shaft;
  const headHalf = 4.25;
  const halo = 'rgba(255,255,255,0.95)';
  const haloSoft = 'rgba(15,23,42,0.45)';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <g transform="rotate(${rot} ${cx} ${yAnchor})">
        <circle cx="${cx}" cy="${yAnchor}" r="3.25" fill="${haloSoft}"/>
        <circle cx="${cx}" cy="${yAnchor}" r="2.25" fill="${halo}"/>
        <circle cx="${cx}" cy="${yAnchor}" r="1.6" fill="${rgb(color)}"/>
        <line x1="${cx}" y1="${yAnchor - 1}" x2="${cx}" y2="${yTip + 2}" stroke="${haloSoft}" stroke-width="5.5" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yAnchor - 1}" x2="${cx}" y2="${yTip + 2}" stroke="${halo}" stroke-width="3.75" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yAnchor - 1}" x2="${cx}" y2="${yTip + 2}" stroke="${rgb(color)}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M${cx} ${yTip - 1.5} L${cx - headHalf - 0.5} ${yTip + 5.5} H${cx + headHalf + 0.5} Z" fill="${haloSoft}"/>
        <path d="M${cx} ${yTip - 1.5} L${cx - headHalf} ${yTip + 5} H${cx + headHalf} Z" fill="${halo}"/>
        <path d="M${cx} ${yTip - 1} L${cx - headHalf + 0.35} ${yTip + 4.5} H${cx + headHalf - 0.35} Z" fill="${rgb(color)}"/>
      </g>
    </svg>
  `.trim();
}

export function buildMapWindArrowHtml(fromDeg: number, speedKt: number, locale: string): string {
  const title = escapeHtmlAttr(buildMapWindArrowTitle(fromDeg, speedKt, locale));
  return `<div class="ventu-wind-arrow" title="${title}">${buildMapWindArrowSvg(fromDeg, speedKt)}</div>`;
}
