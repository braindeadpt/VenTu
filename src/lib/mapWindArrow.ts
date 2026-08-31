/**
 * VenTu spot marker — score pin + integrated wind ring.
 *
 * Wind ring: thin arc on the pin rim (no external arrows) coloured by
 * offshore / onshore / cross relative to coastOrientation.
 */

import {
  getCardinalLabel,
  getWindRelationLabel,
  getWindRelationToCoast,
  type WindRelation,
} from '@/lib/wind';

// Square viewBox, pin dead-centred — no tail. At map density (many spots a
// few hundred metres apart) a pin's tail visually overlaps a neighbour's
// tail/arc and reads as a second, unrelated direction. A centred dot (the
// convention in Windy/Zoom Earth for dense point data) removes that
// ambiguity and simplifies the Leaflet anchor to the icon's centre.
export const MARKER_VIEWBOX_W = 60;
export const MARKER_VIEWBOX_H = 60;
export const PIN_R = 17;
export const PIN_CX = MARKER_VIEWBOX_W / 2;
export const PIN_CY = MARKER_VIEWBOX_H / 2;
const HALO = 'rgba(255,255,255,0.95)';
const OUTLINE = 'rgba(8,15,30,0.92)';
/** Arc centreline ~5px outside the white score rim. */
export const WIND_RING_R = PIN_R + 2.5 + 5;
export const WIND_RING_STROKE = 3.75;

/** Small warning badge drawn on the marker rim (top-right, notification style). */
export const WARNING_BADGE_CX = 46;
export const WARNING_BADGE_CY = 13;
export const WARNING_BADGE_R = 8;

/** SVG fill for the badge per IPMA level (matches WARNING_LEVEL_META palette). */
export const WARNING_BADGE_COLORS: Record<'yellow' | 'orange' | 'red', string> = {
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

/** Warning summary carried into marker/popup/card rendering. */
export interface MapMarkerWarning {
  level: 'yellow' | 'orange' | 'red';
  /** Badge label, e.g. «Mar perigoso» for sea state, «Vento» for wind. */
  label: string;
  /** Sea-state (Agitação Marítima) — card chip renders «Mar perigoso» bold. */
  seaState?: boolean;
}

function buildWarningBadgeSvg(warning: MapMarkerWarning): string {
  const color = WARNING_BADGE_COLORS[warning.level] ?? WARNING_BADGE_COLORS.yellow;
  return `
    <g class="ventu-warning-badge" data-warning-level="${warning.level}" role="img"
      aria-label="${escapeHtmlAttr(warning.label)}">
      <circle cx="${WARNING_BADGE_CX}" cy="${WARNING_BADGE_CY}" r="${WARNING_BADGE_R}"
        fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="1.8"/>
      <text x="${WARNING_BADGE_CX}" y="${WARNING_BADGE_CY + 3.5}" text-anchor="middle"
        font-family="var(--font-geist-mono, 'Geist Mono', ui-monospace, monospace)"
        font-size="11" font-weight="800" fill="#fff">!</text>
    </g>
  `.trim();
}

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Arc span encodes wind strength — never use opacity for force. */
export function windRingArcSpanDegrees(speedKt: number): number {
  if (speedKt < 8) return 40;
  if (speedKt <= 18) return 70;
  return 100;
}

export function windRingRelation(
  windFromDeg: number,
  coastOrientation?: number,
): WindRelation | null {
  if (coastOrientation === undefined) return null;
  return getWindRelationToCoast(windFromDeg, coastOrientation);
}

export function windRingRelationClass(relation: WindRelation | null): string {
  if (relation === 'offshore') return 'ventu-wind-ring--offshore';
  if (relation === 'onshore') return 'ventu-wind-ring--onshore';
  return 'ventu-wind-ring--cross';
}

/** @deprecated WindFlowGlyph speed ramp — not used on map ring. */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [14, 165, 233];
  if (speedKt < 14) return [34, 197, 94];
  if (speedKt < 22) return [6, 182, 212];
  if (speedKt < 30) return [245, 158, 11];
  return [239, 68, 68];
}

/** @deprecated WindFlowGlyph shaft length. */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 32;
  if (speedKt < 12) return 40;
  if (speedKt < 20) return 48;
  if (speedKt < 30) return 56;
  return 64;
}

export function polarOnCircle(
  cx: number,
  cy: number,
  r: number,
  azimuthDeg: number,
): { x: number; y: number } {
  const rad = (azimuthDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

/**
 * SVG arc path (meteorological azimuth: 0° = north, clockwise).
 */
export function describeWindRingArc(
  blowAzimuthDeg: number,
  spanDeg: number,
  cx = PIN_CX,
  cy = PIN_CY,
  r = WIND_RING_R,
): string {
  const start = blowAzimuthDeg - spanDeg / 2;
  const end = blowAzimuthDeg + spanDeg / 2;
  const p0 = polarOnCircle(cx, cy, r, start);
  const p1 = polarOnCircle(cx, cy, r, end);
  const large = spanDeg > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Small outward-pointing tip at arc midpoint. */
export function windRingTipPolygon(
  blowAzimuthDeg: number,
  cx = PIN_CX,
  cy = PIN_CY,
  r = WIND_RING_R,
): string {
  const tipLen = 5;
  const halfW = 3.2;
  const tip = polarOnCircle(cx, cy, r + tipLen, blowAzimuthDeg);
  const { ux, uy } = blowUnitVector(blowAzimuthDeg);
  const px = -uy;
  const py = ux;
  const base = polarOnCircle(cx, cy, r - 0.5, blowAzimuthDeg);
  const b1x = base.x - px * halfW;
  const b1y = base.y - py * halfW;
  const b2x = base.x + px * halfW;
  const b2y = base.y + py * halfW;
  return `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${b1x.toFixed(2)} ${b1y.toFixed(2)} L ${b2x.toFixed(2)} ${b2y.toFixed(2)} Z`;
}

export function blowUnitVector(blowDeg: number): { ux: number; uy: number } {
  const rad = (blowDeg * Math.PI) / 180;
  return { ux: Math.sin(rad), uy: -Math.cos(rad) };
}

export function buildMapWindRingTitle(
  fromDeg: number,
  speedKt: number,
  coastOrientation: number | undefined,
  locale: string,
): string {
  const card = getCardinalLabel(fromDeg);
  const kt = Math.round(speedKt);
  const relation = windRingRelation(fromDeg, coastOrientation);
  const relLabel =
    relation != null
      ? getWindRelationLabel(relation, locale === 'pt' ? 'pt' : 'en').label
      : null;
  if (locale === 'pt') {
    return relLabel
      ? `${kt} kt de ${card} · ${relLabel} · arco = para onde sopra`
      : `${kt} kt de ${card} · arco = para onde sopra`;
  }
  return relLabel
    ? `${kt} kt from ${card} · ${relLabel} · arc = flow direction`
    : `${kt} kt from ${card} · arc = flow direction`;
}

export function buildWindRingSvg(
  fromDeg: number,
  speedKt: number,
  coastOrientation?: number,
): string {
  const blow = windBlowsToDegrees(fromDeg);
  const span = windRingArcSpanDegrees(speedKt);
  const arcD = describeWindRingArc(blow, span);
  const tipD = windRingTipPolygon(blow);
  const relation = windRingRelation(fromDeg, coastOrientation);
  const relClass = windRingRelationClass(relation);

  return `
    <g class="ventu-wind-ring ${relClass}" data-speed-kt="${Math.round(speedKt)}" data-span-deg="${span}">
      <path class="ventu-wind-ring-halo" d="${arcD}" fill="none" stroke-width="${WIND_RING_STROKE + 2}" stroke-linecap="round"/>
      <path class="ventu-wind-ring-arc" d="${arcD}" fill="none" stroke-width="${WIND_RING_STROKE}" stroke-linecap="round"/>
      <path class="ventu-wind-ring-tip" d="${tipD}"/>
    </g>
  `.trim();
}

function buildPinSvg(score: number, scoreRgb: string): string {
  const scoreLabel = Math.round(score);

  return `
    <g class="ventu-marker-pin">
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R + 2.5}" fill="${OUTLINE}"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R}" fill="${scoreRgb}" stroke="${HALO}" stroke-width="2.5"/>
      <text x="${PIN_CX}" y="${PIN_CY + 5}" text-anchor="middle"
        font-family="var(--font-geist-mono, 'Geist Mono', ui-monospace, monospace)"
        font-size="13" font-weight="700" fill="#fff"
        font-variant-numeric="tabular-nums">${scoreLabel}</text>
    </g>
  `.trim();
}

/** Demo marker for WindRingLegend — offshore, medium strength. */
export const WIND_RING_LEGEND_SAMPLE = {
  score: 78,
  fromDeg: 90,
  speedKt: 14,
  coastOrientation: 270,
} as const;

export function buildWindRingMarkerSvg(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
  coastOrientation?: number,
): string {
  const windLayer = showWind ? buildWindRingSvg(fromDeg, speedKt, coastOrientation) : '';
  const pinLayer = buildPinSvg(score, scoreRgb);

  return `
    <svg class="ventu-wind-ring-marker" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${MARKER_VIEWBOX_W} ${MARKER_VIEWBOX_H}" aria-hidden="true">
      ${windLayer}
      ${pinLayer}
    </svg>
  `.trim();
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function buildWindRingMarkerHtml(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
  locale: string,
  coastOrientation?: number,
  warning?: MapMarkerWarning | null,
): string {
  const windTitle = showWind
    ? buildMapWindRingTitle(fromDeg, speedKt, coastOrientation, locale)
    : '';
  const warningTitle = warning
    ? (locale === 'pt'
        ? `Aviso IPMA: ${warning.label} (${warning.level})`
        : `IPMA warning: ${warning.label} (${warning.level})`)
    : '';
  const title = escapeHtmlAttr([windTitle, warningTitle].filter(Boolean).join(' · '));
  const svg = buildWindRingMarkerSvg(score, scoreRgb, fromDeg, speedKt, showWind, coastOrientation);
  const badge = warning ? buildWarningBadgeSvg(warning) : '';

  return `
    <div class="ventu-spot-marker-wrap ventu-marker-enter ventu-wind-ring-marker-wrap"
      style="width:${MARKER_VIEWBOX_W}px;height:${MARKER_VIEWBOX_H}px;cursor:pointer"${title ? ` title="${title}"` : ''}>
      ${svg}
      ${badge}
    </div>
  `.trim();
}

/**
 * Same layout whether or not wind is shown — the pin is centre-anchored
 * (no tail), so toggling wind only adds/removes the rim arc, never
 * resizes or re-anchors the marker.
 */
export function markerIconLayout(_showWind: boolean): {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
} {
  const w = MARKER_VIEWBOX_W;
  const h = MARKER_VIEWBOX_H;
  return {
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    popupAnchor: [0, -(h / 2 + 6)],
  };
}

/** @deprecated use markerIconLayout */
export const markerWindArrowLayout = markerIconLayout;

/** @deprecated use buildWindRingMarkerHtml */
export const buildCompoundSpotMarkerHtml = buildWindRingMarkerHtml;

/** @deprecated use buildWindRingMarkerSvg */
export const buildCompoundSpotMarkerSvg = buildWindRingMarkerSvg;

/** @deprecated */
export const buildMapWindArrowHtml = buildWindRingMarkerHtml;

/** @deprecated */
export const MARKER_MIN_PX = MARKER_VIEWBOX_W;
export const MARKER_MAX_PX = MARKER_VIEWBOX_W;

/** @deprecated */
export function markerPxForZoom(_zoom: number): number {
  return MARKER_VIEWBOX_W;
}
