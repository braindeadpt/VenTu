import { locales, getTranslation } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Shirt, Wind } from 'lucide-react'

// es/de/fr: shell/nav/meta + copy translated (dicionário i18n).
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
    title: tt.metaTitle,
    description: tt.metaDescription,
  }
}

export default async function FerramentasPage({ params }: Props) {
  const { locale } = await params
  const tt = getTranslation(locale).tools

  const tools = [
    {
      href: `/${locale}/ferramentas/calculadora-kite/`,
      icon: Wind,
      title: tt.kiteTitle,
      description: tt.kiteDesc,
    },
    {
      href: `/${locale}/ferramentas/calculadora-fato/`,
      icon: Shirt,
      title: tt.wetsuitTitle,
      description: tt.wetsuitDesc,
    },
  ]

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="font-display text-display-lg font-bold text-fg tracking-tight">
            {tt.toolsHeading}
          </h1>
          <p className="text-fg-muted mt-2 max-w-2xl">{tt.toolsIntro}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="card-1 p-5 flex flex-col gap-3 group hover:border-divider-strong transition-colors duration-150"
              >
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-pill bg-accent/15 text-accent">
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <span className="font-display text-h3 text-fg font-semibold">
                  {tool.title}
                </span>
                <span className="text-body-sm text-fg-muted flex-1">{tool.description}</span>
                <span className="inline-flex items-center gap-1.5 text-meta-sm font-medium text-accent">
                  {tt.open}
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden />
                </span>
              </Link>
            )
          })}
        </div>

        <p className="text-meta-sm text-fg-subtle">{tt.moreSoon}</p>
      </div>
    </div>
  )
}
