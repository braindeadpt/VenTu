'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { Menu, X, Wind, Globe, Search } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import HeaderFreshness from './HeaderFreshness';
import MegaMenu from './MegaMenu';
import SearchPalette from '@/components/search/SearchPalette';
import { getTranslation } from '@/lib/i18n';
import { OPEN_SEARCH_EVENT } from '@/lib/searchEvents';

interface HeaderProps {
  locale: string;
}

export default function Header({ locale }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMega, setOpenMega] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const pathname = usePathname() || '';
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';

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
      firstLink?.focus();
    }
  }, [mobileMenuOpen]);

  const handleMobileKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setMobileMenuOpen(false);
      const hamburger = document.querySelector<HTMLButtonElement>('[aria-controls="mobile-nav"]');
      hamburger?.focus();
    }
  };

  const navLabel = t.nav;

  const isActive = (href: string) => pathname === href.split('?')[0];

  const switchLocale = isPt ? 'en' : 'pt';
  // Only swap the leading /<locale> segment, not arbitrary later occurrences.
  const switchPath =
    (pathname || '/').replace(
      new RegExp(`^/${locale}(?=/|$)`),
      `/${switchLocale}`,
    ) || `/${switchLocale}/`;

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

  const mobileLinkClass =
    'block px-4 py-3 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all';

  return (
    <>
      <header
        className="site-header fixed top-0 left-0 right-0 z-50 bg-bg-base/80 backdrop-blur-xl border-b border-divider transition-[background,border-color] duration-slow"
        onKeyDown={handleKeyDown}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href={`/${locale}/`} className="flex items-center gap-2.5 group shrink-0">
              <Wind className="w-8 h-8 text-data-waves group-hover:text-data-waves/80 transition-colors" />
              <span className="text-xl font-bold text-fg tracking-tight">
                Ven<span className="text-data-waves">Tu</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-0.5 mx-4" aria-label={navLabel.home}>
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
                    className={`px-3 py-1.5 rounded-input text-sm font-medium transition-all ${
                      active || featured
                        ? active
                          ? 'bg-data-waves/15 text-data-waves ring-1 ring-data-waves/25'
                          : 'text-data-waves hover:bg-data-waves/10'
                        : 'text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={openSearch}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-input text-sm text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all"
                aria-label={navLabel.search}
              >
                <Search className="w-4 h-4" />
                <span className="text-xs text-fg-subtle/60 hidden lg:inline">
                  {isMac ? '⌘K' : 'Ctrl+K'}
                </span>
              </button>
              <HeaderFreshness locale={locale} />
              <ThemeToggle locale={locale} />
              <Link
                href={switchPath}
                className="flex items-center gap-1 px-3 py-1.5 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all"
                aria-label={isPt ? 'Switch to English' : 'Mudar para Português'}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="text-xs">{isPt ? 'EN' : 'PT'}</span>
              </Link>
              {/* Avatar / account button removed until auth is wired up.
                  A permanently-disabled button violated WCAG (no feedback)
                  and added a dead 8x8 touch target. Re-introduce when
                  Supabase Auth lands. */}
            </div>

            {/* Mobile actions */}
            <div className="flex items-center gap-1 md:hidden">
              <button
                onClick={openSearch}
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
                aria-label={navLabel.search}
              >
                <Search className="w-5 h-5" />
              </button>
              <ThemeToggle locale={locale} />
              <Link
                href={switchPath}
                className="inline-flex items-center justify-center gap-1 min-w-11 h-11 px-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
                aria-label={isPt ? 'Switch to English' : 'Mudar para Português'}
              >
                <Globe className="w-4 h-4" aria-hidden />
                <span className="text-xs font-semibold">{isPt ? 'EN' : 'PT'}</span>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
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
            'md:hidden overflow-hidden transition-all duration-slow ease-out-expo',
            'bg-bg-base/95 backdrop-blur-xl',
            mobileMenuOpen
              ? 'max-h-[500px] border-b border-divider opacity-100'
              : 'max-h-0 opacity-0 pointer-events-none',
          ].join(' ')}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="px-4 py-3 space-y-1">
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
          </div>
        </div>
      </header>

      {/* Search palette (rendered at document level) */}
      {searchOpen && <SearchPalette locale={locale} onClose={closeSearch} />}
    </>
  );
}
