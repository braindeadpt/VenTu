'use client';

import { useEffect } from 'react';

/**
 * Keeps `<html lang>` in sync on client navigations. The root layout
 * hardcodes `lang="pt-PT"` (static export — nested layouts cannot change
 * `<html>`). `scripts/fixup-html-lang.js` rewrites the attribute in `out/`
 * for first paint / crawlers / no-JS. Do NOT render a `<script>` from this
 * client component, and do not reintroduce a pre-paint head lang mutator —
 * both caused React #418 (HTML) on homepage `/pt/` in map-unmount-race /
 * visual-ux audits (see #46/#47).
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
