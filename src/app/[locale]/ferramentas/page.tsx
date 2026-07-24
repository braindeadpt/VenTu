import { locales } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Shirt, Wind } from 'lucide-react'

// es/de/fr: EN body via isPt branch; shell/nav/meta translated (SEO hreflang MVP).
interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  return {
    title: isPt ? 'Ferramentas náuticas — VenTu' : 'Water sports tools — VenTu',
    description: isPt
      ? 'Calculadoras gratuitas para desportos náuticos: tamanho de kite por vento e peso, fato de neoprene por temperatura da água — com dados reais dos spots portugueses.'
      : 'Free water sports calculators: kite size by wind and weight, wetsuit thickness by water temperature — powered by live Portuguese spot data.',
  }
}

export default async function FerramentasPage({ params }: Props) {
  const { locale } = await params
  const isPt = locale === 'pt'

  const tools = [
    {
      href: `/${locale}/ferramentas/calculadora-kite/`,
      icon: Wind,
      title: isPt ? 'Calculadora de kite' : 'Kite size calculator',
      description: isPt
        ? 'Que tamanho de kite levar? Peso + vento + disciplina, com o vento real de qualquer spot.'
        : 'Which kite size to rig? Weight + wind + discipline, with live wind from any spot.',
    },
    {
      href: `/${locale}/ferramentas/calculadora-fato/`,
      icon: Shirt,
      title: isPt ? 'Calculadora de fato' : 'Wetsuit calculator',
      description: isPt
        ? 'Que espessura de neoprene? Temperatura da água real de cada spot, com windchill.'
        : 'Which wetsuit thickness? Live water temperature per spot, wind chill included.',
    },
  ]

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="font-display text-display-lg font-bold text-fg tracking-tight">
            {isPt ? 'Ferramentas' : 'Tools'}
          </h1>
          <p className="text-fg-muted mt-2 max-w-2xl">
            {isPt
              ? 'Calculadoras rápidas para preparar a sessão — ligadas aos dados reais dos 185 spots.'
              : 'Quick calculators to prep your session — wired to live data from all 185 spots.'}
          </p>
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
                  {isPt ? 'Abrir' : 'Open'}
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden />
                </span>
              </Link>
            )
          })}
        </div>

        <p className="text-meta-sm text-fg-subtle">
          {isPt ? 'Mais ferramentas em breve.' : 'More tools coming soon.'}
        </p>
      </div>
    </div>
  )
}
