/** Discrete wind arrow for Leaflet map markers (meteorological: direction = where wind comes from). */

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Readable at default map zoom; speed still modulates emphasis. */
export function windArrowOpacity(speedKt: number): number {
  if (speedKt < 5) return 0.62;
  if (speedKt < 12) return 0.78;
  if (speedKt < 20) return 0.88;
  return 0.95;
}

export function windArrowStrokeWidth(speedKt: number): number {
  if (speedKt < 8) return 1.5;
  if (speedKt < 18) return 1.75;
  return 2;
}

/** 18×18 arrow + light halo for contrast on satellite/dark tiles (no drop-shadow). */
export function buildMapWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const opacity = windArrowOpacity(speedKt);
  const sw = windArrowStrokeWidth(speedKt);
  const halo = sw + 1.25;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"
      style="transform: rotate(${rot}deg); opacity: ${opacity};">
      <line x1="9" y1="14.5" x2="9" y2="6.5" stroke="rgba(255,255,255,0.75)" stroke-width="${halo}" stroke-linecap="round"/>
      <path d="M9 3.5 L5.25 9.25 H12.75 Z" fill="rgba(255,255,255,0.75)"/>
      <line x1="9" y1="14.5" x2="9" y2="6.5" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"/>
      <path d="M9 3.5 L5.25 9.25 H12.75 Z" fill="currentColor"/>
    </svg>
  `.trim();
}
