import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06b6d4',
}

export const metadata: Metadata = {
  title: 'WindSpot Portugal',
  description: 'Real-time conditions for water sports in Portugal',
  other: {
    'referrer': 'strict-origin-when-cross-origin',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt" className="dark">
      <body className="min-h-screen bg-ocean-950">
        {children}
      </body>
    </html>
  )
}
