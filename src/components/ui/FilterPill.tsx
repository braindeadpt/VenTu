'use client';

import { cn } from '@/lib/cn';

interface FilterPillProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  compact?: boolean;
  activeClassName?: string;
  inactiveClassName?: string;
  'aria-label'?: string;
}

export default function FilterPill({
  active = false,
  onClick,
  children,
  className,
  disabled = false,
  icon,
  compact = false,
  activeClassName,
  inactiveClassName,
  'aria-label': ariaLabel,
}: FilterPillProps) {
  const defaultActive = 'bg-surface-2 text-fg border-divider';
  const defaultInactive = 'bg-surface-1 text-fg-muted border-divider hover:bg-surface-2 hover:text-fg';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill text-sm font-medium whitespace-nowrap shrink-0',
        'transition-all duration-fast border',
        compact ? 'px-2.5 py-1.5 min-h-[40px]' : 'px-4 py-2 min-h-[44px]',
        active
          ? (activeClassName ?? defaultActive)
          : (inactiveClassName ?? defaultInactive),
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
