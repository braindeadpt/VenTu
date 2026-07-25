'use client';

import { useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, User, Heart, Stamp, Bell, Settings } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthProvider';

interface AccountMenuProps {
  locale: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const ACCOUNT_LINKS = [
  { href: 'favorites', icon: Heart, labelKey: 'favorites' as const, anonOk: true },
  { href: 'passaporte', icon: Stamp, labelKey: 'passport' as const, anonOk: true },
  { href: 'alerts', icon: Bell, labelKey: 'alerts' as const, anonOk: false },
  { href: 'conta', icon: Settings, labelKey: 'account' as const, anonOk: false },
] as const;

export default function AccountMenu({ locale, isOpen, onOpen, onClose }: AccountMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = getTranslation(locale as 'pt' | 'en');
  const { session, authLoading, requestLogin, isSupabaseReady } = useAuth();
  const isSignedIn = Boolean(session?.user);

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

  const handleToggle = useCallback(() => {
    if (isOpen) onClose();
    else onOpen();
  }, [isOpen, onOpen, onClose]);

  if (!isSupabaseReady) return null;

  const visibleLinks = ACCOUNT_LINKS.filter((item) => item.anonOk || isSignedIn);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={authLoading}
        className="inline-flex items-center gap-1.5 px-2 2xl:px-3 py-1.5 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all duration-[200ms] ease-out-expo motion-reduce:transition-none max-w-[7rem] 2xl:max-w-[10rem] min-h-[44px] disabled:opacity-50"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="account-menu"
        aria-label={t.nav.accountMenu}
        title={session?.user?.email ?? t.nav.signIn}
      >
        <User className="w-4 h-4 shrink-0" aria-hidden />
        <span className="truncate text-xs">
          {isSignedIn
            ? (session?.user?.email?.split('@')[0] ?? t.nav.account)
            : t.nav.signIn}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-[200ms] ease-out-expo motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id="account-menu"
          role="menu"
          className="absolute top-full right-0 pt-1 w-[min(240px,calc(100vw-2rem))] z-[1300]"
        >
          <div className="rounded-modal border border-divider bg-bg-elevated shadow-modal backdrop-blur-xl p-2">
            {!isSignedIn && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  requestLogin('general');
                }}
                className="flex w-full items-center gap-3 p-3 rounded-card text-sm font-medium text-fg hover:bg-surface-1/[0.04] transition-colors duration-[200ms] ease-out-expo motion-reduce:transition-none"
              >
                <User className="w-4 h-4 text-data-waves" aria-hidden />
                {t.nav.signIn}
              </button>
            )}
            {visibleLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={`/${locale}/${item.href}/`}
                  role="menuitem"
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-card text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-colors duration-[200ms] ease-out-expo motion-reduce:transition-none"
                >
                  <Icon className="w-4 h-4 text-data-waves" aria-hidden />
                  {t.nav[item.labelKey]}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
