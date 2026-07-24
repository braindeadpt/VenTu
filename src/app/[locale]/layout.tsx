import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  locales,
  validateLocale,
  LOCALE_HTML_LANG,
  pickLocale,
  type Locale,
} from '@/lib/i18n'
import { buildHomeMetadata, buildOrganizationJsonLd, buildWebApplicationJsonLd } from '@/lib/seo'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ClientProviders from '@/components/layout/ClientProviders'
import AuthProvider from '@/contexts/AuthProvider'
import SignupNudge from '@/components/homepage/SignupNudge'
import CSPMeta from '@/components/CSPMeta'
import SetHtmlLang from '@/components/SetHtmlLang'
import PageFadeGuard from '@/components/PageFadeGuard'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildHomeMetadata(validateLocale(locale))
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

  const loc = validLocale as Locale
  const htmlLang = LOCALE_HTML_LANG[loc]
  const jsonLd = [buildWebApplicationJsonLd(loc), buildOrganizationJsonLd()]

  return (
    <ClientProviders>
      <AuthProvider>
        <SetHtmlLang lang={htmlLang} />
        <PageFadeGuard />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <CSPMeta />
        <a
          href="#main-content"
          className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-bg-elevated focus:text-fg focus:rounded-card focus:shadow-lg focus:outline-2 focus:outline-score-good"
        >
          {pickLocale(loc, {
            pt: 'Ir para o conteúdo',
            en: 'Skip to content',
            es: 'Saltar al contenido',
            de: 'Zum Inhalt springen',
            fr: 'Aller au contenu',
          })}
        </a>
        <Header locale={locale} />
        <main id="main-content" className="pt-16">{children}</main>
        <Footer locale={locale} />
        <SignupNudge locale={locale} />
      </AuthProvider>
    </ClientProviders>
  )
}
