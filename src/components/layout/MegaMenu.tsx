'use client';

import { useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Map,
  List,
  Compass,
  Video,
  Waves,
  Wind,
  Diamond,
  Sailboat,
  Ship,
  Flame,
  Zap,
} from 'lucide-react';
import { getTranslation } from '@/lib/i18n';

interface MegaMenuProps {
  locale: string;
  isOpen: boolean;
  isActive?: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const EXPLORE_ITEMS = [
  { href: 'mapa', icon: Map, labelKey: 'mapa' as const, descKey: 'descMapa' as const },
  { href: 'spots', icon: List, labelKey: 'spots' as const, descKey: 'descSpots' as const },
  { href: 'explorar', icon: Compass, labelKey: 'explorar' as const, descKey: 'descExplorar' as const },
  { href: 'livecams', icon: Video, labelKey: 'livecams' as const, descKey: 'descLivecams' as const },
] as const;

const MODALIDADES_ITEMS = [
  { id: 'surf', slug: 'surf', icon: Waves, i18nKey: 'modalidadeSurf', i18nDesc: 'modalidadesSurf' },
  { id: 'kitesurf', slug: 'kitesurf', icon: Wind, i18nKey: 'modalidadeKite', i18nDesc: 'modalidadesKite' },
  { id: 'windsurf', slug: 'windsurf', icon: Sailboat, i18nKey: 'modalidadeWind', i18nDesc: 'modalidadesWind' },
  { id: 'big-wave', slug: 'big-wave', icon: Ship, i18nKey: 'modalidadeBigWave', i18nDesc: 'modalidadesBigWave' },
  { id: 'bodyboard', slug: 'bodyboard', icon: Waves, i18nKey: 'modalidadeBodyboard', i18nDesc: 'modalidadesBodyboard' },
  { id: 'sup', slug: 'sup', icon: Diamond, i18nKey: 'modalidadeSup', i18nDesc: 'modalidadesSup' },
  { id: 'foil', slug: 'foil', icon: Flame, i18nKey: 'modalidadeFoil', i18nDesc: 'modalidadesFoil' },
  { id: 'wakeboard', slug: 'wakeboard', icon: Zap, i18nKey: 'modalidadeWakeboard', i18nDesc: 'modalidadesWakeboard' },
] as const;

export default function MegaMenu({ locale, isOpen, isActive = false, onOpen, onClose }: MegaMenuProps) {
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
        aria-controls="mega-menu-conditions"
        aria-current={isActive ? 'true' : undefined}
      >
        {t.nav.conditions}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-[200ms] ease-out-expo motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id="mega-menu-conditions"
          role="menu"
          className="absolute top-full left-0 pt-1 w-[min(560px,calc(100vw-2rem))] z-[1300]"
        >
          <div className="rounded-modal border border-divider bg-bg-elevated shadow-modal backdrop-blur-xl p-4">
            <div className="text-xs font-medium text-fg-subtle uppercase tracking-wider mb-3 px-1">
              {t.megaMenu.conditionsExplore}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {EXPLORE_ITEMS.map((item) => {
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
            <div className="text-xs font-medium text-fg-subtle uppercase tracking-wider mb-3 px-1">
              {/* Título da secção é também o índice /modalidades/ (D9) —
                  era um div morto, sem rota para onde apontar. */}
              <Link
                href={`/${locale}/modalidades/`}
                role="menuitem"
                onClick={onClose}
                className="hover:text-fg transition-colors duration-[200ms] ease-out-expo motion-reduce:transition-none"
              >
                {t.megaMenu.modalidadesTitle}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODALIDADES_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={`/${locale}/modalidades/${item.slug}/`}
                    role="menuitem"
                    onClick={onClose}
                    className="flex items-start gap-3 p-3 rounded-card hover:bg-surface-1/[0.04] transition-colors duration-[200ms] ease-out-expo motion-reduce:transition-none group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-input bg-surface-1/[0.04] text-data-waves group-hover:bg-surface-2/[0.08] transition-colors">
                      <Icon className="w-4 h-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{t.nav[item.i18nKey]}</div>
                      <div className="text-xs text-fg-subtle leading-relaxed">{t.megaMenu[item.i18nDesc]}</div>
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
