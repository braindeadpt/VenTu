'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const THEME_KEY = 'windspot:theme';

interface ThemeToggleProps {
  locale: string;
}

export default function ThemeToggle({ locale }: ThemeToggleProps) {
  const isPt = locale === 'pt';
  // Coast is default (theme-coast class present). Dark is the alternative.
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sync with DOM after mount (SSR-safe: reads actual class applied by pre-hydration script)
  useEffect(() => {
    setIsDark(!document.documentElement.classList.contains('theme-coast'));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('theme-coast', !next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'coast');
    } catch {
      /* ignore */
    }
    setIsDark(next);
  };

  // Prevent hydration mismatch: render a placeholder until mounted
  if (!mounted) {
    return (
      <div className="w-9 h-9" aria-hidden="true" />
    );
  }

  const label = isDark
    ? (isPt ? 'Alternar para tema claro' : 'Switch to light theme')
    : (isPt ? 'Alternar para tema escuro' : 'Switch to dark theme');

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
      title={label}
      aria-label={label}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
