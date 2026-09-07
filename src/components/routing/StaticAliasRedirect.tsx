'use client';

import { useEffect } from 'react';
import { aliasTargetPath } from '@/lib/pathAliases';

interface StaticAliasRedirectProps {
  locale: string;
  canonical: string;
}

/**
 * Client fallback for static-export alias pages. The page also emits a
 * `<meta http-equiv="refresh">` so non-JS clients still land on the canonical path.
 */
export default function StaticAliasRedirect({ locale, canonical }: StaticAliasRedirectProps) {
  const href = aliasTargetPath(locale, canonical);

  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main className="min-h-[40vh] flex items-center justify-center px-4">
      <p className="text-sm text-fg-muted">
        <a href={href} className="underline hover:text-fg transition-colors">
          {href}
        </a>
      </p>
    </main>
  );
}
