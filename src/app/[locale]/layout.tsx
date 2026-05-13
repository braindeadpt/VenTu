import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { locales, getTranslation } from '@/lib/i18n'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import HtmlLang from '@/components/HtmlLang'
import '../globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06b6d4',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  return {
    title: isPt ? 'VenTu — Condições em Tempo Real' : 'VenTu — Real-time Conditions',
    description: isPt
      ? 'Condições em tempo real para surf, kitesurf, windsurf e big wave em Portugal. Dados de ondas, vento e temperatura da água.'
      : 'Real-time conditions for surf, kitesurf, windsurf and big wave in Portugal. Wave, wind and water temperature data.',
    keywords: ['surf', 'kitesurf', 'windsurf', 'Portugal', 'ondas', 'vento', 'Nazaré', 'Peniche', 'big wave'],
    manifest: '/manifest.json',
    icons: {
      icon: '/favicon.svg',
      apple: '/apple-touch-icon.svg',
    },
    openGraph: {
      title: 'VenTu',
      description: isPt
        ? 'Condições em tempo real para desportos náuticos em Portugal'
        : 'Real-time conditions for water sports in Portugal',
      type: 'website',
      locale: isPt ? 'pt_PT' : 'en_US',
      url: 'https://ventu.surf',
      siteName: 'VenTu',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'VenTu',
      description: isPt
        ? 'Condições em tempo real para desportos náuticos em Portugal'
        : 'Real-time conditions for water sports in Portugal',
    },
    robots: {
      index: true,
      follow: true,
    },
    authors: [{ name: 'VenTu PT' }],
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!locales.includes(locale as any)) {
    notFound()
  }

  return (
    <>
      <HtmlLang locale={locale} />
      <Header locale={locale} />
      <main className="pt-16">{children}</main>
      <Footer locale={locale} />
    </>
  )
}
