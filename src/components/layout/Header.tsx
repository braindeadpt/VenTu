'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useRef, type KeyboardEvent, type ChangeEvent } from 'react';
import { Menu, X, Wind, Globe, Search, User } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import MegaMenu from './MegaMenu';
import SearchPalette from '@/components/search/SearchPalette';
import {
  getTranslation,
  locales,
  LOCALE_LABELS,
  LOCALE_NATIVE_NAMES,
  validateLocale,
  type Locale,
} from '@/lib/i18n';
import { OPEN_SEARCH_EVENT } from '@/lib/searchEvents';
import { useAuth } from '@/contexts/AuthProvider';

interface HeaderProps {
  locale: string;
}

export default function Header({ locale }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMega, setOpenMega] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const pathname = usePathname() || '';
  const router = useRouter();
  const loc = validateLocale(locale);
  const t = getTranslation(loc);
  const isPt = loc === 'pt';
  const { session, authLoading, requestLogin, isSupabaseReady } = useAuth();

  useEffect(() => {
    setIsMac(navigator.platform.includes('Mac'));
  }, []);

  useEffect(() => {
    const onOpenSearch = () => setSearchOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
  }, []);

  // Close any open menus / palettes when the route changes (e.g. user
  // hits browser back/forward, or follows a link inside a mega menu).
  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenMega(false);
    setSearchOpen(false);
  }, [pathname]);

  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobileMenuOpen && mobileNavRef.current) {
      const firstLink = mobileNavRef.current.querySelector<HTMLAnchorElement>('a');
      // preventScroll: focusing the first link must not scroll the drawer
      // and hide the locale/theme row at the top.
      firstLink?.focus({ preventScroll: true });
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  // Fecha menu móvel ao passar para desktop (nav completa só em xl+).
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileMenuOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleMobileKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setMobileMenuOpen(false);
      const hamburger = document.querySelector<HTMLButtonElement>('[aria-controls="mobile-nav"]');
      hamburger?.focus();
    }
  };

  const navLabel = t.nav;

  const isActive = (href: string) => pathname === href.split('?')[0];

  const handleLocaleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const next = validateLocale(e.target.value);
      try {
        localStorage.setItem('ventu:locale', next);
      } catch {
        /* noop */
      }
      const nextPath =
        (pathname || '/').replace(new RegExp(`^/${locale}(?=/|$)`), `/${next}`) || `/${next}/`;
      router.push(nextPath);
    },
    [locale, pathname, router],
  );

  const localeSelect = (
    <label className="inline-flex items-center gap-1 min-h-[44px] px-2 rounded-input text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all cursor-pointer shrink-0">
      <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className="sr-only">
        {isPt ? 'Idioma' : loc === 'es' ? 'Idioma' : 'Language'}
      </span>
      <select
        value={loc}
        onChange={handleLocaleChange}
        className="appearance-none bg-transparent border-0 text-xs font-semibold text-fg-subtle hover:text-fg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm pr-1 min-h-[36px]"
        aria-label={isPt ? 'Escolher idioma' : loc === 'es' ? 'Elegir idioma' : 'Choose language'}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l as Locale]} — {LOCALE_NATIVE_NAMES[l as Locale]}
          </option>
        ))}
      </select>
    </label>
  );

  const handleMegaOpen = useCallback(() => {
    setOpenMega(true);
  }, []);

  const handleMegaClose = useCallback(() => {
    setOpenMega(false);
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);

  const navLinks = [
    { href: `/${locale}/mapa/`, label: navLabel.mapa, featured: true },
    { href: `/${locale}/explorar/`, label: navLabel.explorar },
    { href: `/${locale}/sazonalidade/`, label: navLabel.sazonalidade },
    { href: `/${locale}/compare/`, label: navLabel.comparar },
    { href: `/${locale}/livecams/`, label: navLabel.livecams },
    { href: `/${locale}/favorites/`, label: navLabel.favorites },
    { href: `/${locale}/news/`, label: navLabel.news },
    { href: `/${locale}/about/`, label: navLabel.about },
  ];

  const allLinks = [
    ...navLinks,
    { href: `/${locale}/spots/`, label: navLabel.spots },
  ];

  const modalidadeQuickLinks = [
    { slug: 'surf', label: navLabel.modalidadeSurf },
    { slug: 'kitesurf', label: navLabel.modalidadeKite },
    { slug: 'windsurf', label: navLabel.modalidadeWind },
    { slug: 'big-wave', label: navLabel.modalidadeBigWave },
  ];

  const mobileLinkClass =
    'block px-4 py-3 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all';

  return (
    <>
      <header
        className="site-header fixed top-0 left-0 right-0 z-50 bg-bg-base/95 md:bg-bg-base/90 md:backdrop-blur-md border-b border-divider transition-[background,border-color] duration-slow"
        onKeyDown={handleKeyDown}
      >
        <div className="max-w-7xl mx-auto pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:px-6 lg:px-8">
          <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)] items-center gap-x-1.5 sm:gap-x-2 xl:gap-x-3 h-16">
            {/* Logo — isolated so centre nav never paints over it */}
            <Link
              href={`/${locale}/`}
              className="flex items-center gap-2 group min-w-0 relative z-10 pr-0.5"
            >
              <Wind className="w-7 h-7 sm:w-8 sm:h-8 text-accent group-hover:text-accent-hover transition-colors shrink-0" />
              <span className="text-lg sm:text-xl font-bold text-fg tracking-tight truncate">
                Ven<span className="text-accent">Tu</span>
              </span>
            </Link>

            {/* Desktop nav — xl+ only; overflow-visible so MegaMenu is not clipped */}
            <nav
              className="hidden xl:flex items-center justify-center gap-0 min-w-0 overflow-visible px-0.5"
              aria-label={navLabel.home}
            >
              <MegaMenu
                locale={locale}
                isOpen={openMega}
                onOpen={handleMegaOpen}
                onClose={handleMegaClose}
              />
              {navLinks.map((link) => {
                const featured = 'featured' in link && link.featured;
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`shrink-0 px-2 2xl:px-3 py-1.5 rounded-input text-sm font-medium whitespace-nowrap transition-all ${
                      active || featured
                        ? active
                          ? 'bg-accent/15 text-accent ring-1 ring-accent/25'
                          : 'text-accent hover:bg-accent/10'
                        : 'text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop actions */}
            <div className="hidden xl:flex items-center gap-0.5 2xl:gap-1 shrink-0 relative z-10 justify-end pl-1">
              <button
                onClick={openSearch}
                className="inline-flex items-center justify-center gap-2 min-w-9 h-9 px-2 2xl:px-3 rounded-input text-sm text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all"
                aria-label={navLabel.search}
              >
                <Search className="w-4 h-4 shrink-0" />
                <span className="text-xs text-fg-subtle/60 hidden 2xl:inline">
                  {isMac ? '⌘K' : 'Ctrl+K'}
                </span>
              </button>
              <ThemeToggle locale={locale} />
              {localeSelect}
              {isSupabaseReady && (
                session?.user ? (
                  <Link
                    href={`/${locale}/conta/`}
                    className="inline-flex items-center gap-1.5 px-2 2xl:px-3 py-1.5 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all max-w-[7rem] 2xl:max-w-[10rem]"
                    title={session.user.email ?? undefined}
                  >
                    <User className="w-4 h-4 shrink-0" aria-hidden />
                    <span className="truncate text-xs">
                      {session.user.email?.split('@')[0] ?? (isPt ? 'Conta' : 'Account')}
                    </span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestLogin('general')}
                    disabled={authLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all min-h-[44px] disabled:opacity-50"
                  >
                    <User className="w-4 h-4" aria-hidden />
                    {isPt ? 'Entrar' : 'Sign in'}
                  </button>
                )
              )}
            </div>

            {/* Mobile / tablet — only search + menu in the bar (theme/locale in drawer) */}
            <div className="flex items-center gap-0.5 xl:hidden shrink-0 col-start-3 justify-end">
              <button
                onClick={openSearch}
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors shrink-0"
                aria-label={navLabel.search}
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors shrink-0"
                aria-label={mobileMenuOpen ? navLabel.closeMenu : navLabel.openMenu}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu — animated slide-down via max-height transition */}
        <div
          ref={mobileNavRef}
          id="mobile-nav"
          role="navigation"
          aria-label={isPt ? 'Navegação móvel' : 'Mobile navigation'}
          onKeyDown={handleMobileKeyDown}
          className={[
            'xl:hidden overflow-hidden transition-all duration-slow ease-out-expo',
            'bg-bg-base/95 backdrop-blur-xl',
            mobileMenuOpen
              ? 'max-h-[min(80dvh,560px)] border-b border-divider opacity-100 overflow-y-auto'
              : 'max-h-0 opacity-0 pointer-events-none',
          ].join(' ')}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b border-divider mb-2">
              {localeSelect}
              <ThemeToggle locale={locale} />
            </div>
            <p className="px-0 pt-0 pb-1 text-meta-sm font-semibold text-fg-muted">
              {navLabel.modalidades}
            </p>
            {modalidadeQuickLinks.map((item) => (
              <Link
                key={item.slug}
                href={`/${locale}/modalidades/${item.slug}/`}
                onClick={() => setMobileMenuOpen(false)}
                className={mobileLinkClass}
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-divider my-2" role="separator" />
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={mobileLinkClass}
              >
                {link.label}
              </Link>
            ))}
            {isSupabaseReady && (
              session?.user ? (
                <Link
                  href={`/${locale}/conta/`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileLinkClass}
                >
                  {isPt ? 'Conta' : 'Account'}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    requestLogin('general');
                  }}
                  className={`${mobileLinkClass} w-full text-left`}
                >
                  {isPt ? 'Entrar' : 'Sign in'}
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Search palette (rendered at document level) */}
      {searchOpen && <SearchPalette locale={locale} onClose={closeSearch} />}
    </>
  );
}
