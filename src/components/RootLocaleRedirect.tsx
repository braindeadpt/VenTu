'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resolvePreferredLocale } from '@/lib/i18n';

/**
 * Auto-redirect humans to a locale prefix at the root `/`.
 *
 * Pre-paint: a synchronous inline script in `src/app/layout.tsx` `<head>`
 * does the same redirect (priority: localStorage 'ventu:locale' →
 * navigator.language → 'pt'). This component is a safety net for the rare
 * case the inline script is delayed (e.g. slow parse, CSP). Crawlers ignore
 * JS and read the OG metadata, so they never navigate away.
 */
export default function RootLocaleRedirect() {
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ventu:locale');
      const navLang = (navigator.language || '').toLowerCase();
      const locale = resolvePreferredLocale(stored, navLang);
      const target = `/${locale}/`;
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== target &&
        window.location.pathname !== `/${locale}`
      ) {
        router.replace(target);
      }
    } catch {
      router.replace('/pt/');
    }
  }, [router]);

  return null;
}
