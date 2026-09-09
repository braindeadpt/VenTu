'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const THEME_KEY = 'windspot:theme';

interface ThemeToggleProps {
  locale: string;
}

/**
 * Theme toggle with zero placeholder flash.
 *
 * On a static export there is no per-request server read of a persisted
 * theme, so the truth lives in the pre-paint bootstrap script (layout.tsx):
 * it applies `theme-ocean` to <html> from localStorage before first paint.
 * This component leans on that: it server-renders the real button with BOTH
 * icons in the markup and lets CSS pick the visible one from the html class —
 * the correct icon is on screen from the very first paint in either theme.
 * React state (label + aria-pressed) catches up at hydration; there is no
 * attribute divergence between server and client render, so no #418.
 */
export default function ThemeToggle({ locale }: ThemeToggleProps) {
  const isPt = locale === 'pt';
  // Dark is the default (cockpit/nautical night). Light is the opt-in day mode.
  // `null` until hydration = "trust the CSS/class", which is also the SSR state.
  const [isLight, setIsLight] = useState<boolean | null>(null);

  // Read the authoritative class (set pre-paint by the bootstrap script) once,
  // so label + aria-pressed match what is actually on screen after hydration.
  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('theme-ocean'));
  }, []);

  const toggle = () => {
    const next = !(isLight ?? false);
    document.documentElement.classList.toggle('theme-ocean', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
    setIsLight(next);
  };

  const label = isLight
    ? (isPt ? 'Alternar para tema escuro' : 'Switch to dark theme')
    : (isPt ? 'Alternar para tema claro' : 'Switch to light theme');

  return (
    <button
      onClick={toggle}
      className="theme-toggle inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
      title={label}
      aria-label={label}
      aria-pressed={isLight ?? false}
    >
      {/* Both icons always rendered; CSS shows the one matching the html class. */}
      <Sun className="theme-toggle-icon-sun w-5 h-5" aria-hidden />
      <Moon className="theme-toggle-icon-moon w-5 h-5" aria-hidden />
    </button>
  );
}
