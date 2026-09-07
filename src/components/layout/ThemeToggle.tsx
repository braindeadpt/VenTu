'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export const THEME_KEY = 'ventu:theme';
const LEGACY_THEME_KEY = 'windspot:theme';

/** Read theme; migrates legacy `windspot:theme` → `ventu:theme`. */
export function readThemeFromStorage(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = localStorage.getItem(THEME_KEY);
    if (current === 'light' || current === 'dark') return current;
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(THEME_KEY, legacy);
      localStorage.removeItem(LEGACY_THEME_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

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
      localStorage.removeItem(LEGACY_THEME_KEY);
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
