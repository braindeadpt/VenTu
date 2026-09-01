import { locales, getTranslation } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import WetsuitCalculatorClient from '@/components/tools/WetsuitCalculatorClient'

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
    title: tt.wetsuitMetaTitle,
    description: tt.wetsuitMetaDescription,
  }
}

export default async function CalculadoraFatoPage({ params }: Props) {
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
            {tt.wetsuitTitle}
          </h1>
          <p className="text-fg-muted mt-2">{tt.wetsuitIntro}</p>
        </div>

        <WetsuitCalculatorClient locale={locale} />

        <section className="space-y-3 text-body-sm text-fg-muted">
          <h2 className="font-display text-h3 text-fg font-semibold">
            {tt.wetsuitWaterTitle}
          </h2>
          <p>{tt.wetsuitP1}</p>
          <p>{tt.wetsuitP2}</p>
        </section>
      </div>
    </div>
  )
}
