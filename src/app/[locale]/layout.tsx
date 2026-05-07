import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { locales, getTranslation } from '@/lib/i18n'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import '../globals.css'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const { locale } = params
  return {
    title: 'WindSpot Portugal - Condições em Tempo Real',
    description: locale === 'pt'
      ? 'Condições em tempo real para surf, kitesurf, windsurf e big wave em Portugal.'
      : 'Real-time conditions for surf, kitesurf, windsurf and big wave in Portugal.',
    keywords: ['surf', 'kitesurf', 'windsurf', 'Portugal', 'ondas', 'vento', 'Nazaré', 'Peniche'],
  }
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = params
  if (!locales.includes(locale as any)) {
    notFound()
  }

  return (
    <html lang={locale} className="dark">
      <body className="min-h-screen bg-ocean-950">
        <Header locale={locale} />
        <main className="pt-16">{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  )
}
