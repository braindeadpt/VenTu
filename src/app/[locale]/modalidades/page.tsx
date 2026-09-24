import { locales, getTranslation, validateLocale } from '@/lib/i18n'
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { ArrowRight, Diamond, Flame, Sailboat, Ship, Waves, Wind, Zap } from 'lucide-react'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'

// Índice das modalidades (D9): o mega menu ligava as 8 páginas soltas mas o
// título da secção era um div morto e /modalidades/ não tinha página.
// Slugs/i18nKeys são os mesmos do MegaMenu.MODALIDADES_ITEMS.
const MODALIDADES = [
  { slug: 'surf', icon: Waves, i18nKey: 'modalidadeSurf', i18nDesc: 'modalidadesSurf' },
  { slug: 'kitesurf', icon: Wind, i18nKey: 'modalidadeKite', i18nDesc: 'modalidadesKite' },
  { slug: 'windsurf', icon: Sailboat, i18nKey: 'modalidadeWind', i18nDesc: 'modalidadesWind' },
  { slug: 'big-wave', icon: Ship, i18nKey: 'modalidadeBigWave', i18nDesc: 'modalidadesBigWave' },
  { slug: 'bodyboard', icon: Waves, i18nKey: 'modalidadeBodyboard', i18nDesc: 'modalidadesBodyboard' },
  { slug: 'sup', icon: Diamond, i18nKey: 'modalidadeSup', i18nDesc: 'modalidadesSup' },
  { slug: 'foil', icon: Flame, i18nKey: 'modalidadeFoil', i18nDesc: 'modalidadesFoil' },
  { slug: 'wakeboard', icon: Zap, i18nKey: 'modalidadeWakeboard', i18nDesc: 'modalidadesWakeboard' },
] as const

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = getTranslation(locale)
  const loc = validateLocale(locale)
  return buildPageMetadata({
    title: `${t.megaMenu.modalidadesTitle} — VenTu`,
    description: t.pages.modalitiesSubtitle.replace('{schedule}', pipelineSchedule(loc)),
    locale: loc,
    path: `/${loc}/modalidades/`,
  })
}

export default async function ModalidadesPage({ params }: Props) {
  const { locale } = await params
  const t = getTranslation(locale)
  const isPt = locale === 'pt'

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="font-display text-display-lg font-bold text-fg tracking-tight">
            {t.megaMenu.modalidadesTitle}
          </h1>
          <p className="text-fg-muted mt-2 max-w-2xl">
            {getTranslation(locale).pages.modalitiesSubtitle
              .replace('{schedule}', pipelineSchedule(locale))}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODALIDADES.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.slug}
                href={`/${locale}/modalidades/${item.slug}/`}
                className="card-1 p-5 flex flex-col gap-3 group hover:border-divider-strong transition-colors duration-150"
              >
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-pill bg-accent/15 text-accent">
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <span className="font-display text-h3 text-fg font-semibold">
                  {t.nav[item.i18nKey]}
                </span>
                <span className="text-body-sm text-fg-muted flex-1">{t.megaMenu[item.i18nDesc]}</span>
                <span className="inline-flex items-center gap-1.5 text-meta-sm font-medium text-accent">
                  {getTranslation(locale).pages.viewSpots}
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden />
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
