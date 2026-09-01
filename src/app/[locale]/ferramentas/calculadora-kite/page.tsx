import { locales, getTranslation } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import KiteCalculatorClient from '@/components/tools/KiteCalculatorClient'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const tt = getTranslation(locale).tools
  return {
    title: tt.kiteMetaTitle,
    description: tt.kiteMetaDescription,
  }
}

export default async function CalculadoraKitePage({ params }: Props) {
  const { locale } = await params
  const tt = getTranslation(locale).tools

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          href={`/${locale}/ferramentas/`}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {tt.toolsHeading}
        </Link>

        <div>
          <h1 className="font-display text-display-lg font-bold text-fg tracking-tight">
            {tt.kiteTitle}
          </h1>
          <p className="text-fg-muted mt-2">{tt.kiteIntro}</p>
        </div>

        <KiteCalculatorClient locale={locale} />

        <section className="space-y-3 text-body-sm text-fg-muted">
          <h2 className="font-display text-h3 text-fg font-semibold">
            {tt.kiteHowWorks}
          </h2>
          <p>{tt.kiteP1}</p>
          <p>{tt.kiteP2}</p>
          <p>
            {tt.kiteP3Lead}
            <Link href={`/${locale}/mapa/?sport=kitesurf`} className="text-accent hover:underline">
              {tt.kiteP3Link}
            </Link>
            {tt.kiteP3Tail}
          </p>
        </section>
      </div>
    </div>
  )
}
