'use client';

import { useEffect } from 'react';

/**
<<<<<<< HEAD
 * Sets `<html lang>` for the current locale. The root layout hardcodes
 * `lang="pt-PT"` (static export — it can't know the locale at build time
 * for a shared root). An executable `<script>` inside the React tree is not
 * run on client renders and triggers a React DOM warning, so this runs as a
 * plain effect instead.
=======
 * Keeps `<html lang>` in sync on client navigations. The root layout
 * hardcodes `lang="pt-PT"` (static export — nested layouts cannot change
 * `<html>`). A head script in `app/layout.tsx` sets lang from the path
 * before paint; `scripts/fixup-html-lang.js` rewrites the attribute in
 * `out/` for crawlers / no-JS. Do NOT render a `<script>` from this
 * client component — that caused React #418 hydration failures on every
 * locale page in CI.
>>>>>>> 96efc0de3 (fix(a11y): set html lang via head script, not client <script>)
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
