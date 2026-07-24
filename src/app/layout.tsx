import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { spaceGrotesk } from '@/lib/fonts/display'
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, SPOT_COUNT } from '@/lib/seo'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Condições Náuticas em Portugal`,
    template: `%s | ${SITE_NAME}`,
  },
  description: `${SPOT_COUNT} spots · surf, kitesurf, windsurf em Portugal. Scores, mapa e previsão ${pipelineSchedule('pt')}. Grátis e open source.`,
  applicationName: SITE_NAME,
  creator: 'VenTu',
  publisher: 'VenTu',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  other: {
    referrer: 'strict-origin-when-cross-origin',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'pt_PT',
    alternateLocale: ['en_US'],
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    images: [DEFAULT_OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
  },
}

const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('windspot:theme');
      if (t === 'light') {
        document.documentElement.classList.add('theme-ocean');
      }
    } catch (e) {}
  })();
`;

/**
 * Pre-paint locale redirect. Only runs on the root `/` (any other path is
 * already locale-prefixed). Priority: localStorage('ventu:locale') →
 * navigator.language → 'pt'. Supported: pt, en, es.
 */
const localeRedirectScript = `
  (function () {
    try {
      var path = location.pathname;
      if (path !== '/' && path !== '') return;
      var stored = null;
      try { stored = localStorage.getItem('ventu:locale'); } catch (e) {}
      var navLang = (navigator && (navigator.language || navigator.userLanguage)) || '';
      var pick = String(stored || navLang || 'pt').toLowerCase();
      var supported = { pt: 1, en: 1, es: 1 };
      var locale = 'pt';
      var hasPick = !!(stored || navLang);
      if (supported[pick]) locale = pick;
      else {
        var prefix = pick.slice(0, 2);
        if (supported[prefix]) locale = prefix;
        else locale = hasPick ? 'en' : 'pt';
      }
      var target = '/' + locale + '/';
      if (path !== target) location.replace(target);
    } catch (e) {
      location.replace('/pt/');
    }
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
      className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeRedirectScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg-base text-fg font-sans antialiased">
        {children}
        <GoatCounterScript />
      </body>
    </html>
  )
}
