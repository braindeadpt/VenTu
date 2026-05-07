'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, Wind, Globe } from 'lucide-react';

interface HeaderProps {
  locale: string;
}

export default function Header({ locale }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isPt = locale === 'pt';

  const navItems = [
    { href: `/${locale}/`, label: isPt ? 'Início' : 'Home' },
    { href: `/${locale}/spots/`, label: 'Spots' },
    { href: `/${locale}/news/`, label: isPt ? 'Notícias' : 'News' },
    { href: `/${locale}/about/`, label: isPt ? 'Sobre' : 'About' },
  ];

  const switchLocale = isPt ? 'en' : 'pt';
  const switchPath = pathname.replace(`/${locale}`, `/${switchLocale}`);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-ocean-950/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href={`/${locale}/`} className="flex items-center gap-2 group">
            <div className="relative">
              <Wind className="w-8 h-8 text-ocean-400 group-hover:text-ocean-300 transition-colors" />
            </div>
            <span className="text-xl font-bold text-gradient">WindSpot</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  pathname === item.href
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={switchPath}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all ml-2"
            >
              <Globe className="w-4 h-4" />
              {isPt ? 'EN' : 'PT'}
            </Link>
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-ocean-950/95 backdrop-blur-xl border-b border-white/10">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  pathname === item.href
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={switchPath}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
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