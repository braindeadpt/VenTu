/** Discrete wind arrow for Leaflet map markers (meteorological: direction = where wind comes from). */

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

export function windArrowOpacity(speedKt: number): number {
  if (speedKt < 5) return 0.42;
  if (speedKt < 12) return 0.68;
  if (speedKt < 20) return 0.85;
  return 0.95;
}

export function windArrowStrokeWidth(speedKt: number): number {
  if (speedKt < 8) return 1.25;
  if (speedKt < 18) return 1.6;
  return 2;
}

/** Small SVG arrow pointing where the wind blows; rotate with transform. */
export function buildMapWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const opacity = windArrowOpacity(speedKt);
  const sw = windArrowStrokeWidth(speedKt);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"
      style="transform: rotate(${rot}deg); opacity: ${opacity}; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35));">
      <line x1="10" y1="15" x2="10" y2="6" stroke="rgb(139,92,246)" stroke-width="${sw}" stroke-linecap="round"/>
      <path d="M10 4 L6.5 9.5 H13.5 Z" fill="rgb(139,92,246)"/>
    </svg>
  `.trim();
}
