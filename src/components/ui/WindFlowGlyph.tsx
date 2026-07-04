'use client';

import { windArrowColorRgb, windArrowShaftLength, windBlowsToDegrees } from '@/lib/mapWindArrow';
import { getCardinalLabel } from '@/lib/wind';

interface WindFlowGlyphProps {
  /** Meteorological degrees — where wind comes from. */
  directionDeg: number;
  speedKt: number;
  size?: number;
  className?: string;
}

/** Compact Windy-style flow arrow for hero chips and inline metrics. */
export default function WindFlowGlyph({
  directionDeg,
  speedKt,
  size = 18,
  className,
}: WindFlowGlyphProps) {
  const rot = windBlowsToDegrees(directionDeg);
  const shaft = windArrowShaftLength(speedKt) * (size / 40);
  const [r, g, b] = windArrowColorRgb(speedKt);
  const color = `rgb(${r},${g},${b})`;
  const cx = size / 2;
  const yAnchor = size - 2;
  const yTip = yAnchor - shaft;
  const headHalf = size * 0.11;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden
    >
      <g transform={`rotate(${rot} ${cx} ${yAnchor})`}>
        <circle cx={cx} cy={yAnchor} r={size * 0.1} fill="rgba(255,255,255,0.9)" />
        <circle cx={cx} cy={yAnchor} r={size * 0.065} fill={color} />
        <line
          x1={cx}
          y1={yAnchor - 0.5}
          x2={cx}
          y2={yTip + 1}
          stroke="rgba(255,255,255,0.95)"
          strokeWidth={size * 0.16}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={yAnchor - 0.5}
          x2={cx}
          y2={yTip + 1}
          stroke={color}
          strokeWidth={size * 0.09}
          strokeLinecap="round"
        />
        <path
          d={`M${cx} ${yTip - 0.5} L${cx - headHalf} ${yTip + headHalf * 1.2} H${cx + headHalf} Z`}
          fill={color}
        />
      </g>
    </svg>
  );
}

export function windFlowAriaLabel(directionDeg: number, speedKt: number, locale: string): string {
  const card = getCardinalLabel(directionDeg);
  const kt = Math.round(speedKt);
  return locale === 'pt'
    ? `Vento ${kt} nós de ${card}`
    : `Wind ${kt} knots from ${card}`;
}
