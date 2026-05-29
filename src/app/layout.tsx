import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { spaceGrotesk } from '@/lib/fonts/display'
import './globals.css'
import GoatCounterScript from '@/components/analytics/GoatCounterScript'

/**
 * VenTu Root Layout
 *
 * Geist Sans (body) + Geist Mono (data) + Space Grotesk (display headlines) via
 * the `geist` package (Vercel's official wrapper for Next.js < 15).
 * Zero external requests — subsets are shipped with the build.
 * Variable fonts give us the full weight range in a single file each.
 *
 * CSS variables wired in tailwind.config.ts:
 *   --font-geist-sans → font-sans utility
 *   --font-geist-mono → font-mono utility (tabular-nums for scores)
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
    { media: '(prefers-color-scheme: light)', color: '#FAFAF7' },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL('https://ventu.surf'),
  title: 'VenTu',
  description: 'VenTu — Water sports conditions in Portugal, updated every 3 hours',
  other: {
    referrer: 'strict-origin-when-cross-origin',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
  manifest: '/manifest.json',
}

const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('windspot:theme');
      if (t === 'dark') {
        document.documentElement.classList.remove('theme-ocean');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-PT"
      className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable} theme-ocean`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg-base text-fg font-sans antialiased">
        {children}
        <GoatCounterScript />
      </body>
    </html>
  )
}
