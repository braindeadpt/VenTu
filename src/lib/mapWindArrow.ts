/** Discrete wind arrow for Leaflet map markers (meteorological: direction = where wind comes from). */

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Shaft length encodes speed (kt) — opacity stays at 1 for satellite legibility. */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 5.5;
  if (speedKt < 12) return 7.5;
  if (speedKt < 20) return 9.5;
  return 11.5;
}

const ARROW_SIZE = 24;

/** 24×24 arrow: dark outline + light fill; speed → shaft length (not opacity). */
export function buildMapWindArrowSvg(fromDeg: number, speedKt: number): string {
  const rot = windBlowsToDegrees(fromDeg);
  const shaft = windArrowShaftLength(speedKt);
  const cx = ARROW_SIZE / 2;
  const yTail = ARROW_SIZE - 3;
  const yHead = yTail - shaft;
  const headHalf = 3.25;
  const outline = 'rgba(15,23,42,0.92)';
  const fill = 'rgba(241,245,249,0.95)';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${ARROW_SIZE}" height="${ARROW_SIZE}" viewBox="0 0 ${ARROW_SIZE} ${ARROW_SIZE}" aria-hidden="true"
      style="transform: rotate(${rot}deg); opacity: 1;">
      <line x1="${cx}" y1="${yTail}" x2="${cx}" y2="${yHead + 2}" stroke="${outline}" stroke-width="3.25" stroke-linecap="round"/>
      <path d="M${cx} ${yHead - 1} L${cx - headHalf - 0.5} ${yHead + 4.5} H${cx + headHalf + 0.5} Z" fill="${outline}"/>
      <line x1="${cx}" y1="${yTail}" x2="${cx}" y2="${yHead + 2}" stroke="${fill}" stroke-width="1.75" stroke-linecap="round"/>
      <path d="M${cx} ${yHead - 1} L${cx - headHalf} ${yHead + 4} H${cx + headHalf} Z" fill="${fill}"/>
    </svg>
  `.trim();
}
