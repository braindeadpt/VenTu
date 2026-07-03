'use client';

import { useEffect } from 'react';

/**
 * Sets `<html lang>` for the current locale. The root layout hardcodes
 * `lang="pt-PT"` (static export — it can't know the locale at build time
 * for a shared root). An executable `<script>` inside the React tree is not
 * run on client renders and triggers a React DOM warning, so this runs as a
 * plain effect instead.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
