'use client';

import { useEffect } from 'react';

/**
 * Keeps `<html lang>` in sync on client navigations. The root layout
 * hardcodes `lang="pt-PT"` (static export — nested layouts cannot change
 * `<html>`). `scripts/fixup-html-lang.js` rewrites the attribute in `out/`
 * for first paint / crawlers / no-JS. Do NOT render a `<script>` from this
 * client component — that caused React #418 hydration failures in CI.
 * Do NOT also mutate lang from a root head script: that raced hydration on
 * the homepage (args[]=HTML) under the CI build→test gap.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
