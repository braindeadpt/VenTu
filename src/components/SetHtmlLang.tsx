'use client';

import { useEffect } from 'react';

/**
 * Keeps `<html lang>` in sync on client navigations. The root layout
 * hardcodes `lang="pt-PT"` (static export — nested layouts cannot change
 * `<html>`). A head script in `app/layout.tsx` sets lang from the path
 * before paint; `scripts/fixup-html-lang.js` rewrites the attribute in
 * `out/` for crawlers / no-JS. Do NOT render a `<script>` from this
 * client component — that caused React #418 hydration failures on every
 * locale page in CI.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
