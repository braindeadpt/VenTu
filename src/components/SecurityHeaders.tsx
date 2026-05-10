'use client';

import { useEffect } from 'react';

export default function SecurityHeaders() {
  useEffect(() => {
    // Add CSP meta tag dynamically since Next.js static export doesn't support headers
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.openstreetmap.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self'; connect-src 'self' https://api.github.com https://*.supabase.co; frame-src https://www.openstreetmap.org; object-src 'none'; base-uri 'self';";
    document.head.appendChild(meta);

    // Add referrer policy
    const referrerMeta = document.createElement('meta');
    referrerMeta.name = 'referrer';
    referrerMeta.content = 'strict-origin-when-cross-origin';
    document.head.appendChild(referrerMeta);

    return () => {
      document.head.removeChild(meta);
      document.head.removeChild(referrerMeta);
    };
  }, []);

  return null;
}