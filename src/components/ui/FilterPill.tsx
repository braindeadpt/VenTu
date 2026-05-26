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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'pill inline-flex items-center gap-1.5 text-meta font-medium whitespace-nowrap shrink-0',
        'transition-[background-color,border-color,color] duration-150',
        compact ? 'px-2 py-1.5 min-h-[36px]' : 'px-3 py-2 min-h-[44px]',
        active
          ? (activeClassName ?? 'pill-active')
          : (inactiveClassName ?? 'pill-ghost'),
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
