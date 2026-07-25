'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useRef, type KeyboardEvent, type ChangeEvent } from 'react';
import { Menu, X, Wind, Globe, Search, ChevronDown } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import MegaMenu from './MegaMenu';
import PlanMegaMenu from './PlanMegaMenu';
import AccountMenu from './AccountMenu';
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

type MegaKey = 'conditions' | 'plan' | null;
type MobileSection = 'conditions' | 'plan' | 'account' | null;

function pathUnder(pathname: string, locale: string, segment: string): boolean {
  const base = `/${locale}/${segment}`;
  return pathname === base || pathname === `${base}/` || pathname.startsWith(`${base}/`);
}

export default function Header({ locale }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMega, setOpenMega] = useState<MegaKey>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<MobileSection>('conditions');
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const pathname = usePathname() || '';
  const router = useRouter();
  const loc = validateLocale(locale);
  const t = getTranslation(loc);
  const { session, authLoading, requestLogin, isSupabaseReady } = useAuth();
  const isSignedIn = Boolean(session?.user);

  const conditionsActive =
    pathUnder(pathname, locale, 'mapa') ||
    pathUnder(pathname, locale, 'spots') ||
    pathUnder(pathname, locale, 'explorar') ||
    pathUnder(pathname, locale, 'livecams') ||
    pathUnder(pathname, locale, 'modalidades');

  const planActive =
    pathUnder(pathname, locale, 'sazonalidade') ||
    pathUnder(pathname, locale, 'compare') ||
    pathUnder(pathname, locale, 'ferramentas');

  const directoryActive = pathUnder(pathname, locale, 'diretorio');
  const newsActive = pathUnder(pathname, locale, 'news');

  useEffect(() => {
    setIsMac(navigator.platform.includes('Mac'));
  }, []);

  useEffect(() => {
    const onOpenSearch = () => setSearchOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenMega(null);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobileMenuOpen && mobileNavRef.current) {
      const firstFocusable = mobileNavRef.current.querySelector<HTMLElement>(
        'button, a',
      );
      firstFocusable?.focus({ preventScroll: true });
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

  // Hamburger through lg (1024px); full nav from lg up.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
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
      <span className="sr-only">{navLabel.language}</span>
      <select
        value={loc}
        onChange={handleLocaleChange}
        className="appearance-none bg-transparent border-0 text-xs font-semibold text-fg-subtle hover:text-fg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm pr-1 min-h-[36px]"
        aria-label={navLabel.chooseLanguage}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l as Locale]} — {LOCALE_NATIVE_NAMES[l as Locale]}
          </option>
        ))}
      </select>
    </label>
  );

  const openConditions = useCallback(() => {
    setAccountOpen(false);
    setOpenMega('conditions');
  }, []);

  const openPlan = useCallback(() => {
    setAccountOpen(false);
    setOpenMega('plan');
  }, []);

  const closeMega = useCallback(() => {
    setOpenMega(null);
  }, []);

  const openAccount = useCallback(() => {
    setOpenMega(null);
    setAccountOpen(true);
  }, []);

  const closeAccount = useCallback(() => {
    setAccountOpen(false);
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

  const toggleMobileSection = (section: Exclude<MobileSection, null>) => {
    setMobileSection((prev) => (prev === section ? null : section));
  };

  const closeMobile = () => setMobileMenuOpen(false);

  const linkClass = (active: boolean) =>
    `shrink-0 px-1.5 2xl:px-3 py-1.5 rounded-input text-sm font-medium whitespace-nowrap transition-all duration-[200ms] ease-out-expo motion-reduce:transition-none ${
      active
        ? 'bg-accent/15 text-accent ring-1 ring-accent/25'
        : 'text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04]'
    }`;

  const mobileLinkClass =
    'block px-4 py-3 rounded-input text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04] transition-all duration-[200ms] ease-out-expo motion-reduce:transition-none min-h-[44px]';

  const mobileSectionBtn =
    'flex w-full items-center justify-between px-4 py-3 rounded-input text-sm font-semibold text-fg hover:bg-surface-1/[0.04] transition-all duration-[200ms] ease-out-expo motion-reduce:transition-none min-h-[44px]';

  const conditionsLinks = [
    { href: `/${locale}/mapa/`, label: navLabel.mapa },
    { href: `/${locale}/spots/`, label: navLabel.spots },
    { href: `/${locale}/explorar/`, label: navLabel.explorar },
    { href: `/${locale}/livecams/`, label: navLabel.livecams },
  ];

  const modalidadesLinks = [
    { slug: 'surf', label: navLabel.modalidadeSurf },
    { slug: 'kitesurf', label: navLabel.modalidadeKite },
    { slug: 'windsurf', label: navLabel.modalidadeWind },
    { slug: 'big-wave', label: navLabel.modalidadeBigWave },
    { slug: 'bodyboard', label: navLabel.modalidadeBodyboard },
    { slug: 'sup', label: navLabel.modalidadeSup },
    { slug: 'foil', label: navLabel.modalidadeFoil },
    { slug: 'wakeboard', label: navLabel.modalidadeWakeboard },
  ];

  const planLinks = [
    { href: `/${locale}/sazonalidade/`, label: navLabel.sazonalidade },
    { href: `/${locale}/compare/`, label: navLabel.comparar },
    { href: `/${locale}/ferramentas/calculadora-kite/`, label: navLabel.kiteCalc },
    { href: `/${locale}/ferramentas/calculadora-fato/`, label: navLabel.wetsuitCalc },
    { href: `/${locale}/ferramentas/`, label: navLabel.allTools },
  ];

  const accountLinks = [
    { href: `/${locale}/favorites/`, label: navLabel.favorites, anonOk: true },
    { href: `/${locale}/passaporte/`, label: navLabel.passport, anonOk: true },
    { href: `/${locale}/alerts/`, label: navLabel.alerts, anonOk: false },
    { href: `/${locale}/conta/`, label: navLabel.account, anonOk: false },
  ].filter((l) => l.anonOk || isSignedIn);

  return (
    <>
      <header
        className="site-header fixed top-0 left-0 right-0 z-[1300] bg-bg-base/95 md:bg-bg-base/90 md:backdrop-blur-md border-b border-divider transition-[background,border-color] duration-slow"
        onKeyDown={handleKeyDown}
      >
        <div className="max-w-7xl mx-auto pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:px-6 lg:px-8">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 lg:gap-x-4 2xl:gap-x-6 h-16">
            <Link
              href={`/${locale}/`}
              className="flex items-center gap-2 group shrink-0 relative z-20"
            >
              <Wind className="w-7 h-7 sm:w-8 sm:h-8 text-accent group-hover:text-accent-hover transition-colors shrink-0" />
              <span className="text-lg sm:text-xl font-bold text-fg tracking-tight">
                Ven<span className="text-accent">Tu</span>
              </span>
            </Link>

            <nav
              className="hidden lg:flex items-center justify-start gap-0 min-w-0 overflow-visible"
              aria-label={navLabel.home}
            >
              <MegaMenu
                locale={locale}
                isOpen={openMega === 'conditions'}
                isActive={conditionsActive}
                onOpen={openConditions}
                onClose={closeMega}
              />
              <PlanMegaMenu
                locale={locale}
                isOpen={openMega === 'plan'}
                isActive={planActive}
                onOpen={openPlan}
                onClose={closeMega}
              />
              <Link
                href={`/${locale}/diretorio/`}
                className={linkClass(directoryActive)}
                aria-current={directoryActive ? 'page' : undefined}
              >
                {navLabel.directory}
              </Link>
              <Link
                href={`/${locale}/news/`}
                className={linkClass(newsActive)}
                aria-current={newsActive ? 'page' : undefined}
              >
                {navLabel.news}
              </Link>
            </nav>

            <div className="hidden lg:flex items-center gap-0.5 2xl:gap-1 shrink-0 relative z-20 justify-end">
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
              <AccountMenu
                locale={locale}
                isOpen={accountOpen}
                onOpen={openAccount}
                onClose={closeAccount}
              />
            </div>

            <div className="flex items-center gap-0.5 lg:hidden shrink-0 col-start-3 justify-end">
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

        <div
          ref={mobileNavRef}
          id="mobile-nav"
          role="navigation"
          aria-label={navLabel.mobileNav}
          onKeyDown={handleMobileKeyDown}
          className={[
            'lg:hidden overflow-hidden transition-all duration-[300ms] ease-out-expo motion-reduce:transition-none',
            'bg-bg-base/95 backdrop-blur-xl',
            mobileMenuOpen
              ? 'max-h-[min(85dvh,640px)] border-b border-divider opacity-100 overflow-y-auto'
              : 'max-h-0 opacity-0 pointer-events-none',
          ].join(' ')}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b border-divider mb-2">
              {localeSelect}
              <ThemeToggle locale={locale} />
            </div>

            <button
              type="button"
              className={mobileSectionBtn}
              aria-expanded={mobileSection === 'conditions'}
              onClick={() => toggleMobileSection('conditions')}
            >
              {navLabel.conditions}
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-[200ms] ease-out-expo motion-reduce:transition-none ${
                  mobileSection === 'conditions' ? 'rotate-180' : ''
                }`}
              />
            </button>
            {mobileSection === 'conditions' && (
              <div className="pb-2 space-y-0.5">
                {conditionsLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobile}
                    className={`${mobileLinkClass} ${isActive(link.href) ? 'text-accent bg-accent/10' : ''}`}
                    aria-current={isActive(link.href) ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                ))}
                <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  {t.megaMenu.modalidadesTitle}
                </p>
                {modalidadesLinks.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/${locale}/modalidades/${item.slug}/`}
                    onClick={closeMobile}
                    className={mobileLinkClass}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            <button
              type="button"
              className={mobileSectionBtn}
              aria-expanded={mobileSection === 'plan'}
              onClick={() => toggleMobileSection('plan')}
            >
              {navLabel.plan}
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-[200ms] ease-out-expo motion-reduce:transition-none ${
                  mobileSection === 'plan' ? 'rotate-180' : ''
                }`}
              />
            </button>
            {mobileSection === 'plan' && (
              <div className="pb-2 space-y-0.5">
                {planLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobile}
                    className={`${mobileLinkClass} ${isActive(link.href) ? 'text-accent bg-accent/10' : ''}`}
                    aria-current={isActive(link.href) ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}

            <Link
              href={`/${locale}/diretorio/`}
              onClick={closeMobile}
              className={`${mobileLinkClass} font-semibold text-fg ${directoryActive ? 'text-accent bg-accent/10' : ''}`}
              aria-current={directoryActive ? 'page' : undefined}
            >
              {navLabel.directory}
            </Link>
            <Link
              href={`/${locale}/news/`}
              onClick={closeMobile}
              className={`${mobileLinkClass} font-semibold text-fg ${newsActive ? 'text-accent bg-accent/10' : ''}`}
              aria-current={newsActive ? 'page' : undefined}
            >
              {navLabel.news}
            </Link>

            <div className="border-t border-divider my-2" role="separator" />

            <button
              type="button"
              className={mobileSectionBtn}
              aria-expanded={mobileSection === 'account'}
              onClick={() => toggleMobileSection('account')}
            >
              {navLabel.accountMenu}
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-[200ms] ease-out-expo motion-reduce:transition-none ${
                  mobileSection === 'account' ? 'rotate-180' : ''
                }`}
              />
            </button>
            {mobileSection === 'account' && (
              <div className="pb-2 space-y-0.5">
                {isSupabaseReady && !isSignedIn && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMobile();
                      requestLogin('general');
                    }}
                    disabled={authLoading}
                    className={`${mobileLinkClass} w-full text-left disabled:opacity-50`}
                  >
                    {navLabel.signIn}
                  </button>
                )}
                {accountLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobile}
                    className={mobileLinkClass}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && <SearchPalette locale={locale} onClose={closeSearch} />}
    </>
  );
}
