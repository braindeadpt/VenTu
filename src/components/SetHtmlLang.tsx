'use client';

import { useEffect } from 'react';

/**
 * Sets `<html lang>` for the current locale. The root layout hardcodes
 * `lang="pt-PT"` (static export — nested layouts cannot change `<html>`).
 * An executable `<script>` inside the React tree (body or head via a client
 * child) triggers React #418 hydration failures on locale pages in CI, so
 * this runs as a plain effect for soft navigations instead. Do not reintroduce
 * a pre-paint head script here without verifying homepage `/pt/` health —
 * that path also threw #418 HTML in map-unmount-race / visual-ux audits.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
