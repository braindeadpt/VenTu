'use client';

import { useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  CalendarRange,
  GitCompareArrows,
  Wind,
  Thermometer,
  Wrench,
} from 'lucide-react';
import { getTranslation } from '@/lib/i18n';

interface PlanMegaMenuProps {
  locale: string;
  isOpen: boolean;
  isActive?: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const PLAN_ITEMS = [
  {
    href: 'sazonalidade',
    icon: CalendarRange,
    labelKey: 'sazonalidade' as const,
    descKey: 'descSazonalidade' as const,
  },
  {
    href: 'compare',
    icon: GitCompareArrows,
    labelKey: 'comparar' as const,
    descKey: 'descComparar' as const,
  },
  {
    href: 'ferramentas/calculadora-kite',
    icon: Wind,
    labelKey: 'kiteCalc' as const,
    descKey: 'descKite' as const,
  },
  {
    href: 'ferramentas/calculadora-fato',
    icon: Thermometer,
    labelKey: 'wetsuitCalc' as const,
    descKey: 'descFato' as const,
  },
  {
    href: 'ferramentas',
    icon: Wrench,
    labelKey: 'allTools' as const,
    descKey: 'descTools' as const,
  },
] as const;

export default function PlanMegaMenu({
  locale,
  isOpen,
  isActive = false,
  onOpen,
  onClose,
}: PlanMegaMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = getTranslation(locale as 'pt' | 'en');

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      onClose();
      closeTimerRef.current = null;
    }, 150);
  }, [clearCloseTimer, onClose]);

  const handleOpen = useCallback(() => {
    clearCloseTimer();
    onOpen();
  }, [clearCloseTimer, onOpen]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      triggerRef.current?.focus();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleClickOutside, handleEscape]);

  // Hover opens on desktop; click toggles for touch / keyboard.
  // On devices with hover, mouseenter already opens before click — a plain
  // toggle would immediately close the panel (hover → click → close).
  const handleToggle = useCallback(() => {
    const canHover =
      typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
    if (canHover) {
      if (!isOpen) handleOpen();
      return;
    }
    if (isOpen) onClose();
    else handleOpen();
  }, [isOpen, handleOpen, onClose]);

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={handleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 shrink-0 whitespace-nowrap px-1.5 2xl:px-3 py-1.5 rounded-input text-sm font-medium transition-all duration-[200ms] ease-out-expo motion-reduce:transition-none ${
          isActive
            ? 'bg-accent/15 text-accent ring-1 ring-accent/25'
            : 'text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04]'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="mega-menu-plan"
        aria-current={isActive ? 'true' : undefined}
      >
        {t.nav.plan}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-[200ms] ease-out-expo motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id="mega-menu-plan"
          role="menu"
          className="absolute top-full left-0 pt-1 w-[min(360px,calc(100vw-2rem))] z-[1300]"
        >
          <div className="rounded-modal border border-divider bg-bg-elevated shadow-modal backdrop-blur-xl p-4">
            <div className="text-xs font-medium text-fg-subtle uppercase tracking-wider mb-3 px-1">
              {t.megaMenu.planTitle}
            </div>
            <div className="flex flex-col gap-1">
              {PLAN_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={`/${locale}/${item.href}/`}
                    role="menuitem"
                    onClick={onClose}
                    className="flex items-start gap-3 p-3 rounded-card hover:bg-surface-1/[0.04] transition-colors duration-[200ms] ease-out-expo motion-reduce:transition-none group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-input bg-surface-1/[0.04] text-data-waves group-hover:bg-surface-2/[0.08] transition-colors">
                      <Icon className="w-4 h-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{t.nav[item.labelKey]}</div>
                      <div className="text-xs text-fg-subtle leading-relaxed">{t.megaMenu[item.descKey]}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
