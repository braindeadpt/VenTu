'use client';

import { useEffect } from 'react';

/**
 * Sets `<html lang>` for the current locale. The root layout hardcodes
 * `lang="pt-PT"` (static export — nested layouts cannot change `<html>`).
 * A blocking inline script runs before paint; the effect covers soft
 * client navigations. Crawlers / no-JS get the correct lang from the
 * post-build rewrite in scripts/fixup-html-lang.js.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.lang=${JSON.stringify(lang)};`,
      }}
    />
  );
}
