import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import GoatCounterScript from '@/components/analytics/GoatCounterScript'

/**
 * VenTu Root Layout
 *
 * Geist Sans (display/body) + Geist Mono (numbers/code) loaded via
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
  title: 'VenTu',
  description: 'VenTu — Real-time conditions for water sports in Portugal',
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
      className={`${GeistSans.variable} ${GeistMono.variable} theme-ocean`}
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
