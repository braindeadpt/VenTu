import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { locales, validateLocale } from '@/lib/i18n'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import HtmlLang from '@/components/HtmlLang'
import ClientProviders from '@/components/layout/ClientProviders'
import CSPMeta from '@/components/CSPMeta'
import '../globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
    { media: '(prefers-color-scheme: light)', color: '#FAFAF7' },
  ],
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  return {
    title: isPt ? 'VenTu — Condições Náuticas em Portugal' : 'VenTu — Water Sports Conditions in Portugal',
    description: isPt
      ? 'Condições para surf, kitesurf, windsurf e big wave em Portugal. Dados actualizados a cada 3 horas — ondas, vento e temperatura da água.'
      : 'Conditions for surf, kitesurf, windsurf and big wave in Portugal. Data updated every 3 hours — waves, wind and water temperature.',
    keywords: ['surf', 'kitesurf', 'windsurf', 'Portugal', 'ondas', 'vento', 'Nazaré', 'Peniche', 'big wave'],
    manifest: '/manifest.json',
    icons: {
      icon: '/favicon.svg',
      apple: '/apple-touch-icon.svg',
    },
    openGraph: {
      title: 'VenTu',
      description: isPt
        ? 'Condições para desportos náuticos em Portugal — actualizadas a cada 3 horas'
        : 'Water sports conditions in Portugal — updated every 3 hours',
      type: 'website',
      locale: isPt ? 'pt_PT' : 'en_US',
      url: 'https://ventu.surf',
      siteName: 'VenTu',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'VenTu',
      description: isPt
        ? 'Condições para desportos náuticos em Portugal — actualizadas a cada 3 horas'
        : 'Water sports conditions in Portugal — updated every 3 hours',
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
  const validLocale = validateLocale(locale)
  if (validLocale !== locale) {
    notFound()
  }

  return (
    <ClientProviders>
      <CSPMeta />
      <HtmlLang locale={locale} />
      <Header locale={locale} />
      <main className="pt-16">{children}</main>
      <Footer locale={locale} />
    </ClientProviders>
  )
}
