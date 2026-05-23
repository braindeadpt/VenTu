'use client';

import { useEffect } from 'react';

export default function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    // Sync <html lang> with route locale (root layout hard-codes pt-PT).
    // Do NOT touch theme classes here — theme is managed by the
    // pre-hydration script in app/layout.tsx + ThemeToggle (which uses
    // `.theme-ocean` for light, absence for dark). Adding `.dark`
    // here was a no-op visually but caused stale class on locale switch.
    document.documentElement.lang = locale === 'pt' ? 'pt-PT' : 'en';
  }, [locale]);

  return null;
}