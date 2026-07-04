/**
 * Wind vector overlaid on spot score markers (Windy convention).
 *
 * - Meteorological direction = where wind COMES FROM.
 * - Vector points WHERE wind blows, rooted at the score circle (no extra dot).
 */

import { getCardinalLabel } from '@/lib/wind';

export const WIND_OVERLAY_VIEWBOX = 56;
export const WIND_ARROW_MIN_PX = 52;
export const WIND_ARROW_MAX_PX = 68;
const WIND_ARROW_BASE_ZOOM = 8;
const PIN_RADIUS = 17;

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Speed → colour (legible on light satellite and dark map). */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [14, 165, 233];
  if (speedKt < 14) return [34, 197, 94];
  if (speedKt < 22) return [6, 182, 212];
  if (speedKt < 30) return [245, 158, 11];
  return [239, 68, 68];
}

/** Length outside the score circle (px in overlay coords). */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 10;
  if (speedKt < 12) return 14;
  if (speedKt < 20) return 18;
  if (speedKt < 30) return 22;
  return 26;
}

export function windArrowPxForZoom(zoom: number): number {
  if (zoom <= WIND_ARROW_BASE_ZOOM) return WIND_ARROW_MIN_PX;
  const t = Math.min(1, (zoom - WIND_ARROW_BASE_ZOOM) / 5);
  return Math.round(WIND_ARROW_MIN_PX + t * (WIND_ARROW_MAX_PX - WIND_ARROW_MIN_PX));
}

/** Pin size unchanged — wind vector overflows with visible clipping. */
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

  return {
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -46],
  };
}

export function buildMapWindArrowTitle(fromDeg: number, speedKt: number, locale: string): string {
  const card = getCardinalLabel(fromDeg);
  const kt = Math.round(speedKt);
  return locale === 'pt'
    ? `${kt} kt de ${card} · vector indica para onde sopra`
    : `${kt} kt from ${card} · vector shows flow direction`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Windy-style stem + head, rotated around pin centre. */
export function buildMarkerWindOverlaySvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const shaft = windArrowShaftLength(speedKt);
  const color = windArrowColorRgb(speedKt);
  const size = WIND_OVERLAY_VIEWBOX;
  const cx = size / 2;
  const cy = size / 2;
  const yBase = cy - PIN_RADIUS;
  const yTip = yBase - shaft;
  const headW = 5.5;
  const stroke = `rgb(${color.join(',')})`;
  const outline = 'rgba(15,23,42,0.88)';

  return `
    <svg class="ventu-marker-wind" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <g transform="rotate(${rot} ${cx} ${cy})">
        <line x1="${cx}" y1="${yBase}" x2="${cx}" y2="${yTip + 4}" stroke="${outline}" stroke-width="5" stroke-linecap="round"/>
        <line x1="${cx}" y1="${yBase}" x2="${cx}" y2="${yTip + 4}" stroke="${stroke}" stroke-width="2.75" stroke-linecap="round"/>
        <path d="M${cx} ${yTip - 0.5} L${cx - headW} ${yTip + 6} L${cx + headW} ${yTip + 6} Z" fill="${outline}"/>
        <path d="M${cx} ${yTip} L${cx - headW + 0.75} ${yTip + 5.25} L${cx + headW - 0.75} ${yTip + 5.25} Z" fill="${stroke}"/>
      </g>
    </svg>
  `.trim();
}

/** @deprecated Use buildMarkerWindOverlaySvg — kept for tests/import stability. */
export const buildMapWindArrowSvg = buildMarkerWindOverlaySvg;

export function buildMapWindArrowHtml(fromDeg: number, speedKt: number, locale: string): string {
  const title = escapeHtmlAttr(buildMapWindArrowTitle(fromDeg, speedKt, locale));
  return `<div class="ventu-marker-wind-wrap" title="${title}">${buildMarkerWindOverlaySvg(fromDeg, speedKt)}</div>`;
}
