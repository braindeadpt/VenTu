import type { Metadata } from 'next';
import Link from 'next/link';
import { buildRootMetadata } from '@/lib/seo';
import RootLocaleRedirect from '@/components/RootLocaleRedirect';

export const metadata: Metadata = buildRootMetadata();

/**
 * The redirect-to-locale logic runs as an inline script in the root layout
 * `<head>` (see src/app/layout.tsx). Crawlers (Googlebot, social previews)
 * ignore JS and read the OG metadata above, so they stay on `/`.
 *
 * This `RootPage` only renders the `<noscript>` fallback (for browsers with
 * JavaScript disabled) and the small inline client component that
 * redundantly redirects in case the inline `<head>` script is delayed.
 */
export default function RootPage() {
  return (
    <>
      <RootLocaleRedirect />
      <noscript>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1.5rem',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: '#0F172A',
            color: '#F1F5F9',
          }}
        >
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.875rem', opacity: 0.7, margin: 0 }}>
            ventu.surf
          </p>
          <h1 style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0.5rem 0' }}>
            VenTu
          </h1>
          <p style={{ marginTop: '0.5rem', fontSize: '1.125rem', maxWidth: '32rem', opacity: 0.8, lineHeight: 1.55 }}>
            Condições náuticas em Portugal — surf, kitesurf, windsurf. Grátis e open source.
          </p>
          <p style={{ marginTop: '2rem', fontSize: '0.875rem', opacity: 0.6 }}>Escolhe o teu idioma:</p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href="/pt/"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: '#06B6D4',
                color: '#0F172A',
                fontWeight: 600,
                borderRadius: '6px',
                textDecoration: 'none',
                minWidth: '140px',
              }}
            >
              Português
            </Link>
            <Link
              href="/en/"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#F1F5F9',
                fontWeight: 600,
                borderRadius: '6px',
                textDecoration: 'none',
                minWidth: '140px',
              }}
            >
              English
            </Link>
            <Link
              href="/es/"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#F1F5F9',
                fontWeight: 600,
                borderRadius: '6px',
                textDecoration: 'none',
                minWidth: '140px',
              }}
            >
              Español
            </Link>
          </div>
        </div>
      </noscript>
    </>
  );
}
