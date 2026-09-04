'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAnimatedNumericValue } from '@/lib/animatedNumericValue';
import { cn } from '@/lib/cn';

interface StatChipProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
  /** Overrides the default value aria-label (e.g. wind direction context). */
  ariaLabel?: string;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export default function StatChip({ icon, value, label, className, ariaLabel }: StatChipProps) {
  // Extract leading numeric value for count-up animation.
  const match = value.match(/^([\d.-]+)/);
  const targetNum = match ? parseFloat(match[1]) : null;

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
      ? formatAnimatedNumericValue(displayNum, value)
      : value;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-card border border-divider bg-surface-1/[0.04] px-2.5 py-2',
        className,
      )}
    >
      <span className="shrink-0 text-fg-subtle" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-num-sm text-fg tabular-nums leading-tight" aria-label={ariaLabel ?? value} data-visual-dynamic>
          {animatedValue}
        </p>
        <p className="text-meta-sm text-fg-subtle leading-tight">{label}</p>
      </div>
    </div>
  );
}
