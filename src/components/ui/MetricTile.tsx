'use client';

import { cn } from '@/lib/cn';

export interface MetricTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Dashboard metric cell — value-first, short explanatory hint.
 * Renders `value` as-is (no count-up) to keep SSR and hydration identical.
 */
export default function MetricTile({ label, value, hint, icon, className }: MetricTileProps) {
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
        {value}
      </p>
      {hint && <p className="text-meta-sm text-fg-subtle leading-snug">{hint}</p>}
    </div>
  );
}
