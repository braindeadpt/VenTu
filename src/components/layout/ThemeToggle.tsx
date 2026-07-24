'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const THEME_KEY = 'windspot:theme';

interface ThemeToggleProps {
  locale: string;
}

export default function ThemeToggle({ locale }: ThemeToggleProps) {
  const isPt = locale === 'pt';
  // Dark is the default (cockpit/nautical night). Light is the opt-in day mode.
  const [isLight, setIsLight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('theme-ocean'));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !isLight;
    document.documentElement.classList.toggle('theme-ocean', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
    setIsLight(next);
  };

  if (!mounted) {
    return <div className="w-11 h-11 shrink-0" aria-hidden="true" />;
  }

  const label = isLight
    ? (isPt ? 'Alternar para tema escuro' : 'Switch to dark theme')
    : (isPt ? 'Alternar para tema claro' : 'Switch to light theme');

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
      title={label}
      aria-label={label}
      aria-pressed={isLight}
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
