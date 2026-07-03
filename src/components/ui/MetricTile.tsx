'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MetricTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Dashboard metric cell — value-first, short explanatory hint. */
export default function MetricTile({ label, value, hint, icon, className }: MetricTileProps) {
  const match = value.match(/^([\d.-]+)/);
  const targetNum = match ? parseFloat(match[1]) : null;
  const suffix = match ? value.slice(match[1].length) : value;

  const [displayNum, setDisplayNum] = useState<number | null>(targetNum !== null ? 0 : null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (targetNum === null || hasAnimated.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplayNum(targetNum);
      hasAnimated.current = true;
      return;
    }
    const duration = 400;
    const start = performance.now();
    hasAnimated.current = true;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplayNum(targetNum * easeOutExpo(progress));
      if (progress < 1) requestAnimationFrame(tick);
    };
    setDisplayNum(0);
    requestAnimationFrame(tick);
  }, [targetNum]);

  const animatedValue =
    displayNum !== null && targetNum !== null
      ? displayNum.toFixed(targetNum % 1 === 0 ? 0 : 1) + suffix
      : value;

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-card border border-divider bg-surface-1/[0.04] px-3 py-3 min-h-[72px]',
        'transition-[border-color,background-color] duration-150 ease-out hover:border-divider-strong',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-meta-sm text-fg-muted">
        {icon && (
          <span className="shrink-0 text-fg-subtle" aria-hidden>
            {icon}
          </span>
        )}
        <span>{label}</span>
      </div>
      <p className="font-mono text-num text-fg tabular-nums leading-tight" aria-label={value}>
        {animatedValue}
      </p>
      {hint && <p className="text-meta-sm text-fg-subtle leading-snug">{hint}</p>}
    </div>
  );
}
