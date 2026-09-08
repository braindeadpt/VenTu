'use client';

import { useEffect } from 'react';

/**
 * Keeps `<html lang>` in sync on client navigations. The root layout
 * hardcodes `lang="pt-PT"` (static export — nested layouts cannot change
 * `<html>`). Do NOT render a `<script>` from this client component — that
 * caused React #418 hydration failures on every locale page in CI.
 * A pre-paint head script + post-build lang rewrite is tracked on #45; do
 * not re-introduce it here until that approach is green in CI.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
