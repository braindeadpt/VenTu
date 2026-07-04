/**
 * Spot wind arrows on the map — Windy-inspired layout, VenTu spots only.
 *
 * - Meteorological FROM → arrow points WHERE wind blows.
 * - Colour ramp ≈ wind speed (Windy-style readability).
 * - Shaft length scales with speed.
 */

import { getCardinalLabel } from '@/lib/wind';

export const WIND_ARROW_VIEWBOX = 36;
export const WIND_ARROW_MIN_PX = 32;
export const WIND_ARROW_MAX_PX = 48;
const WIND_ARROW_BASE_ZOOM = 9;
const WIND_OUTLINE = 'rgba(15, 23, 42, 0.85)';

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Windy-style speed → colour (legible on satellite and dark tiles). */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [14, 165, 233];
  if (speedKt < 14) return [34, 197, 94];
  if (speedKt < 22) return [6, 182, 212];
  if (speedKt < 30) return [245, 158, 11];
  return [239, 68, 68];
}

/** Shaft length outside origin (viewBox units). */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 9;
  if (speedKt < 12) return 12;
  if (speedKt < 20) return 15;
  if (speedKt < 30) return 18;
  return 21;
}

export function windArrowPxForZoom(zoom: number): number {
  if (zoom <= WIND_ARROW_BASE_ZOOM) return WIND_ARROW_MIN_PX;
  const t = Math.min(1, (zoom - WIND_ARROW_BASE_ZOOM) / 4);
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
  const w = Math.max(36, arrowPx);
  const h = arrowPx + 2 + 34 + 8;

  return {
    iconSize: [w, h],
    iconAnchor: [Math.round(w / 2), h],
    popupAnchor: [0, -h],
  };
}

export function buildMapWindArrowTitle(fromDeg: number, speedKt: number, locale: string): string {
  const card = getCardinalLabel(fromDeg);
  const kt = Math.round(speedKt);
  return locale === 'pt'
    ? `${kt} kt de ${card} · seta = para onde sopra · cor = intensidade`
    : `${kt} kt from ${card} · arrow = flow · color = strength`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Windy-style stem + head + origin dot, rotated at arrow base above pin. */
export function buildSpotWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const shaft = windArrowShaftLength(speedKt);
  const [r, g, b] = windArrowColorRgb(speedKt);
  const stroke = `rgb(${r},${g},${b})`;
  const size = WIND_ARROW_VIEWBOX;
  const cx = size / 2;
  const yBase = size - 3;
  const yTip = yBase - shaft;
  const headW = 5;

  return `
    <svg class="ventu-spot-wind-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <g transform="rotate(${rot} ${cx} ${yBase})">
        <circle cx="${cx}" cy="${yBase}" r="3.25" fill="${WIND_OUTLINE}"/>
        <circle cx="${cx}" cy="${yBase}" r="2.25" fill="${stroke}"/>
        <line x1="${cx}" y1="${yBase - 2}" x2="${cx}" y2="${yTip + 3}" stroke="${WIND_OUTLINE}" stroke-width="4.5" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yBase - 2}" x2="${cx}" y2="${yTip + 3}" stroke="${stroke}" stroke-width="2.75" stroke-linecap="round"/>
        <path d="M${cx} ${yTip - 0.5} L${cx - headW} ${yTip + 5.5} L${cx + headW} ${yTip + 5.5} Z" fill="${WIND_OUTLINE}"/>
        <path d="M${cx} ${yTip} L${cx - headW + 0.6} ${yTip + 4.5} L${cx + headW - 0.6} ${yTip + 4.5} Z" fill="${stroke}"/>
      </g>
    </svg>
  `.trim();
}

export const buildMarkerWindOverlaySvg = buildSpotWindArrowSvg;
export const buildMapWindArrowSvg = buildSpotWindArrowSvg;

export function buildMapWindArrowHtml(fromDeg: number, speedKt: number, locale: string): string {
  const title = escapeHtmlAttr(buildMapWindArrowTitle(fromDeg, speedKt, locale));
  return `<div class="ventu-spot-wind" title="${title}">${buildSpotWindArrowSvg(fromDeg, speedKt)}</div>`;
}
