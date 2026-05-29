'use client';

import { useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, Map, Waves, Wind, Diamond, Sailboat, Ship, Flame, Zap } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';

interface MegaMenuProps {
  locale: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

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

export default function MegaMenu({ locale, isOpen, onOpen, onClose }: MegaMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = getTranslation(locale as 'pt' | 'en');

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

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        onClick={onOpen}
        onMouseEnter={onOpen}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="mega-menu-modalidades"
      >
        {t.nav.modalidades}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-base ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id="mega-menu-modalidades"
          role="menu"
          className="absolute top-full left-0 pt-1 w-[480px] z-[1300]"
        >
          <div className="rounded-modal border border-divider bg-bg-elevated shadow-modal backdrop-blur-xl p-4">
            <Link
              href={`/${locale}/mapa/`}
              role="menuitem"
              onClick={onClose}
              className="flex items-center gap-3 p-3 mb-3 rounded-card border border-data-waves/30 bg-data-waves/[0.06] hover:bg-data-waves/10 transition-colors group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-input bg-data-waves/15 text-data-waves">
                <Map className="w-5 h-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-data-waves">{t.nav.mapa}</div>
                <div className="text-xs text-fg-subtle leading-relaxed">
                  {locale === 'pt'
                    ? 'Mapa fullscreen com filtros e condições em tempo real'
                    : 'Fullscreen map with filters and live conditions'}
                </div>
              </div>
            </Link>
            <div className="text-xs font-medium text-fg-subtle uppercase tracking-wider mb-3 px-1">
              {t.megaMenu.modalidadesTitle}
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
                    className="flex items-start gap-3 p-3 rounded-card hover:bg-surface-1/[0.04] transition-colors group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-input bg-surface-1/[0.04] text-data-waves group-hover:bg-surface-2/[0.08] transition-colors">
                      <Icon className="w-4 h-4" />
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
