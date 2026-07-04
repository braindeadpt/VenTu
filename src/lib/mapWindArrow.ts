/**
 * Spot wind arrows on the map — Windy-inspired, VenTu spots only.
 *
 * - Meteorological FROM → arrow points WHERE wind blows.
 * - Colour ramp ≈ wind speed; shaft length scales with speed (~22–28px).
 */

import { getCardinalLabel } from '@/lib/wind';

export const WIND_ARROW_VIEWBOX = 56;
export const WIND_ARROW_MIN_PX = 52;
export const WIND_ARROW_MAX_PX = 72;
const WIND_ARROW_BASE_ZOOM = 8;
const WIND_OUTLINE = 'rgba(15, 23, 42, 0.9)';

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

/** Shaft length in viewBox units (~22–28px when rendered at default size). */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 18;
  if (speedKt < 12) return 22;
  if (speedKt < 20) return 25;
  if (speedKt < 30) return 28;
  return 32;
}

export function windArrowPxForZoom(zoom: number): number {
  if (zoom <= WIND_ARROW_BASE_ZOOM) return WIND_ARROW_MIN_PX;
  const t = Math.min(1, (zoom - WIND_ARROW_BASE_ZOOM) / 5);
  return Math.round(WIND_ARROW_MIN_PX + t * (WIND_ARROW_MAX_PX - WIND_ARROW_MIN_PX));
}

export function markerWindArrowLayout(showWind: boolean, arrowPx = WIND_ARROW_MAX_PX): {
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

  const w = Math.max(40, arrowPx);
  const h = arrowPx + 4 + 34 + 8;

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

/** Windy-style stem + head + origin dot. Pivot at bottom centre (sits above score pin). */
export function buildSpotWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const shaft = windArrowShaftLength(speedKt);
  const [r, g, b] = windArrowColorRgb(speedKt);
  const stroke = `rgb(${r},${g},${b})`;
  const size = WIND_ARROW_VIEWBOX;
  const cx = size / 2;
  const yBase = size - 6;
  const yTip = yBase - shaft;
  const headW = 7;

  return `
    <svg class="ventu-spot-wind-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <g transform="rotate(${rot} ${cx} ${yBase})">
        <circle cx="${cx}" cy="${yBase}" r="4.5" fill="${WIND_OUTLINE}"/>
        <circle cx="${cx}" cy="${yBase}" r="3.25" fill="${stroke}"/>
        <line x1="${cx}" y1="${yBase - 3}" x2="${cx}" y2="${yTip + 4}" stroke="${WIND_OUTLINE}" stroke-width="6" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yBase - 3}" x2="${cx}" y2="${yTip + 4}" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M${cx} ${yTip - 1} L${cx - headW} ${yTip + 7} L${cx + headW} ${yTip + 7} Z" fill="${WIND_OUTLINE}"/>
        <path d="M${cx} ${yTip} L${cx - headW + 0.8} ${yTip + 5.8} L${cx + headW - 0.8} ${yTip + 5.8} Z" fill="${stroke}"/>
      </g>
    </svg>
  `.trim();
}

export const buildMarkerWindOverlaySvg = buildSpotWindArrowSvg;
export const buildMapWindArrowSvg = buildSpotWindArrowSvg;

export function buildMapWindArrowHtml(
  fromDeg: number,
  speedKt: number,
  locale: string,
  arrowPx = WIND_ARROW_MIN_PX,
): string {
  const title = escapeHtmlAttr(buildMapWindArrowTitle(fromDeg, speedKt, locale));
  return `<div class="ventu-spot-wind" style="width:${arrowPx}px;height:${arrowPx}px" title="${title}">${buildSpotWindArrowSvg(fromDeg, speedKt)}</div>`;
}
