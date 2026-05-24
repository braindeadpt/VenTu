'use client';

import { cn } from '@/lib/cn';

interface FilterPillProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function FilterPill({
  active = false,
  onClick,
  children,
  className,
  disabled = false,
}: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'px-4 py-2 rounded-pill text-sm font-medium whitespace-nowrap min-h-[44px]',
        'transition-all duration-fast border',
        active
          ? 'bg-surface-2 text-fg border-divider'
          : 'bg-surface-1 text-fg-muted border-divider hover:bg-surface-2 hover:text-fg',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}
