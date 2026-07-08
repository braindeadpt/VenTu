'use client';

import { cn } from '@/lib/cn';

interface MoonIconProps {
  illumination: number;
  waxing: boolean;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Moon disc with real terminator (two-arc path), not discrete sprites.
 * Dark = surface token; lit = fg token.
 */
export function moonTerminatorPath(
  cx: number,
  cy: number,
  r: number,
  illumination: number,
  waxing: boolean,
): string {
  const lit = Math.max(0, Math.min(1, illumination));
  if (lit <= 0.002) return '';
  if (lit >= 0.998) {
    return `M ${cx - r},${cy} A ${r},${r} 0 1,0 ${cx + r},${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} Z`;
  }

  const phi = lit * Math.PI;
  const dx = (waxing ? 1 : -1) * r * Math.cos(phi);
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = waxing ? 0 : 1;

  return [
    `M ${cx},${cy - r}`,
    `A ${r},${r} 0 0,${sweepOuter} ${cx + dx},${cy}`,
    `A ${r},${r} 0 0,${sweepInner} ${cx},${cy + r}`,
    `A ${r},${r} 0 0,${sweepOuter} ${cx - dx},${cy}`,
    'Z',
  ].join(' ');
}

export default function MoonIcon({
  illumination,
  waxing,
  size = 28,
  className,
  title,
}: MoonIconProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1.5;
  const litPath = moonTerminatorPath(cx, cy, r, illumination, waxing);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('shrink-0', className)}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="rgb(var(--surface-2))"
        stroke="rgb(var(--divider))"
        strokeWidth="1"
      />
      {litPath ? (
        <path d={litPath} fill="rgb(var(--fg))" />
      ) : null}
    </svg>
  );
}
