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
        // Compact pills: 44px por omissão (piso do projecto) — a densidade
        // de 36px aplica-se SÓ a desktops de rato puro (≥lg + any-pointer:
        // fine, via .filter-pill-compact em globals.css — decisão V3′ 2026-09).
        // Híbridos (touch laptops, tablets em paisagem) ficam com 44px mesmo
        // no layout desktop: o alvo de um chip está limitado à altura da
        // linha (hit-area invisível por pseudo é recortado pelo overflow e o
        // hit-test está confinado à border box).
        compact ? 'px-2 py-1.5 filter-pill-compact' : 'px-3 py-2 min-h-[44px]',
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
