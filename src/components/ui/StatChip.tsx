'use client';

import { cn } from '@/lib/cn';

interface StatChipProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
  /** Overrides the default value aria-label (e.g. wind direction context). */
  ariaLabel?: string;
}

/**
 * Hero metric chip. Renders `value` as-is (no count-up) so SSR / hydration
 * never flash 0.0 or diverge on animated intermediate strings (React #418).
 */
export default function StatChip({ icon, value, label, className, ariaLabel }: StatChipProps) {
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
          {value}
        </p>
        <p className="text-meta-sm text-fg-subtle leading-tight">{label}</p>
      </div>
    </div>
  );
}
