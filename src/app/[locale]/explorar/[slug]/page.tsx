import { loadSpotData } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import { locales } from '@/lib/i18n'
import {
  SEO_LANDINGS,
  getSeoLanding,
  landingDescription,
  landingTitle,
} from '@/lib/seoLandings'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = []
  for (const locale of locales) {
    for (const landing of SEO_LANDINGS) {
      params.push({ locale, slug: landing.slug })
    }
  }
  return params
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const landing = getSeoLanding(slug)
  if (!landing) return {}

  const title = `${landingTitle(landing, locale)} — VenTu`
  const description = landingDescription(landing, locale)

  return {
    title,
    description,
    openGraph: { title, description },
  }
}

export default async function ExplorarPage({ params }: Props) {
  const { locale, slug } = await params
  const isPt = locale === 'pt'
  const landing = getSeoLanding(slug)
  if (!landing) notFound()

  const spotsData = loadSpotData()
  const title = landingTitle(landing, locale)
  const description = landingDescription(landing, locale)

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          href={`/${locale}/spots/`}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isPt ? 'Todos os spots' : 'All spots'}
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-fg">{title}</h1>
          <p className="text-fg-muted mt-2 max-w-2xl">{description}</p>
        </div>
      </div>

      <SpotGridClient
        spotsData={spotsData}
        locale={locale}
        regions={[...MACRO_REGIONS]}
        initialSport={landing.sport}
        initialRegion={landing.region}
      />
    </div>
  )
}
