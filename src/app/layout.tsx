import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'WindSpot Portugal',
  description: 'Real-time conditions for water sports in Portugal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
