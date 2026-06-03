'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Auto-redirect humans to /pt/ or /en/ — crawlers ignore JS and keep OG metadata. */
export default function RootLocaleRedirect() {
  const router = useRouter();

  useEffect(() => {
    const lang = (navigator.language || 'pt').toLowerCase();
    router.replace(lang.startsWith('pt') ? '/pt/' : '/en/');
  }, [router]);

  return null;
}
