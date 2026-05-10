import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06b6d4',
}

// CSP via meta-tag (útil para GitHub Pages sem headers HTTP custom)
// NOTA: frame-ancestors NÃO funciona em meta-tag CSP — só via HTTP header
// Para GitHub Pages, isto é o máximo possível
const cspContent = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.openstreetmap.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com https://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com",
  "frame-src https://www.openstreetmap.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export const metadata: Metadata = {
  title: 'WindSpot Portugal',
  description: 'Real-time conditions for water sports in Portugal',
  openGraph: {
    title: 'WindSpot Portugal',
    description: 'Real-time conditions for surf, kitesurf, windsurf and big wave in Portugal',
    type: 'website',
    images: [{
      url: '/og-image.svg',
      width: 1200,
      height: 630,
      alt: 'WindSpot Portugal - Real-time water sports conditions',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WindSpot Portugal',
    description: 'Real-time conditions for surf, kitesurf, windsurf and big wave in Portugal',
    images: ['/og-image.png'],
  },
  other: {
    'referrer': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': cspContent,
    'format-detection': 'telephone=no',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt" className="dark">
      <body className="min-h-screen bg-slate-950">
        {children}
      </body>
    </html>
  )
}
