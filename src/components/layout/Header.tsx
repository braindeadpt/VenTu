'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, Wind, Globe } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  locale: string;
}

export default function Header({ locale }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname() || '';
  const isPt = locale === 'pt';

  const navItems = [
    { href: `/${locale}/`, label: isPt ? 'Início' : 'Home' },
    { href: `/${locale}/spots/`, label: 'Spots' },
    { href: `/${locale}/favorites/`, label: isPt ? 'Favs' : 'Favs' },
    { href: `/${locale}/compare/?spots=supertubos,guincho`, label: isPt ? 'VS' : 'VS', special: true },
    { href: `/${locale}/news/`, label: isPt ? 'Notícias' : 'News' },
    { href: `/${locale}/about/`, label: isPt ? 'Sobre' : 'About' },
  ];

  // pathname does NOT include query string, so strip ? from href for comparison
  const isActive = (href: string) => pathname === href.split('?')[0];

  const switchLocale = isPt ? 'en' : 'pt';
  const switchPath = (pathname || '').replace(`/${locale}`, `/${switchLocale}`);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg-base/80 backdrop-blur-xl border-b border-divider">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href={`/${locale}/`} className="flex items-center gap-2.5 group">
            <div className="relative">
              <Wind className="w-10 h-10 text-data-waves group-hover:text-data-waves/80 transition-colors" />
            </div>
            <span className="text-2xl font-bold text-fg tracking-tight">Ven<span className="text-data-waves">Tu</span></span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-surface-2 text-fg'
                    : 'text-fg-subtle hover:text-fg hover:bg-surface-2/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <ThemeToggle locale={locale} />
            <Link
              href={switchPath}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-2/50 transition-all"
            >
              <Globe className="w-4 h-4" />
              {isPt ? 'EN' : 'PT'}
            </Link>
          </nav>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle locale={locale} />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-2/50 transition-colors"
              aria-label={mobileMenuOpen ? (isPt ? 'Fechar menu' : 'Close menu') : (isPt ? 'Abrir menu' : 'Open menu')}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-bg-base/95 backdrop-blur-xl border-b border-divider">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-surface-2 text-fg'
                    : 'text-fg-subtle hover:text-fg hover:bg-surface-2/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={switchPath}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-fg-subtle hover:text-fg hover:bg-surface-2/50 transition-all"
            >
              <Globe className="w-4 h-4" />
              {isPt ? 'Switch to English' : 'Mudar para Português'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
