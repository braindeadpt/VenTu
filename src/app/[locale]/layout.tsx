import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { locales, validateLocale } from '@/lib/i18n'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ClientProviders from '@/components/layout/ClientProviders'
import CSPMeta from '@/components/CSPMeta'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const canonical = `/${locale}/`
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
    alternates: {
      canonical,
      languages: {
        'pt': '/pt/',
        'en': '/en/',
      },
    },
    openGraph: {
      title: isPt ? 'VenTu — Condições Náuticas' : 'VenTu — Water Sports Conditions',
      description: isPt
        ? 'Condições para desportos náuticos em Portugal — actualizadas a cada 3 horas'
        : 'Water sports conditions in Portugal — updated every 3 hours',
      type: 'website',
      locale: isPt ? 'pt_PT' : 'en_US',
      url: canonical,
      siteName: 'VenTu',
      images: [{ url: '/og-image.svg', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: isPt ? 'VenTu — Condições Náuticas' : 'VenTu — Water Sports Conditions',
      description: isPt
        ? 'Condições para desportos náuticos em Portugal — actualizadas a cada 3 horas'
        : 'Water sports conditions in Portugal — updated every 3 hours',
      images: ['/og-image.svg'],
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

  const isPt = locale === 'pt'
  const htmlLang = isPt ? 'pt-PT' : 'en'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'VenTu',
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    url: `https://ventu.surf/${locale}/`,
    description: isPt
      ? 'Condições para surf, kitesurf, windsurf e big wave em Portugal — actualizadas a cada 3 horas'
      : 'Water sports conditions in Portugal — updated every 3 hours',
    inLanguage: locale === 'pt' ? 'pt-PT' : 'en',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }

  return (
    <ClientProviders>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${htmlLang}";`,
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CSPMeta />
      <a
        href="#main-content"
        className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-bg-elevated focus:text-fg focus:rounded-card focus:shadow-lg focus:outline-2 focus:outline-score-good"
      >
        {isPt ? 'Ir para o conteúdo' : 'Skip to content'}
      </a>
      <Header locale={locale} />
      <main id="main-content" className="pt-16">{children}</main>
      <Footer locale={locale} />
    </ClientProviders>
  )
}
