import { loadSpotListings } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import MapTilePreconnect from '@/components/MapTilePreconnect'
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
import ExplorarRegionHero from '@/components/explorar/ExplorarRegionHero'

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

  const spotsData = loadSpotListings()
  const title = landingTitle(landing, locale)
  const description = landingDescription(landing, locale)

  const regionHero =
    landing.region && landing.region !== 'Todos' ? (
      <ExplorarRegionHero
        region={landing.region}
        locale={locale}
        title={title}
        description={description}
      />
    ) : null

  return (
    <div className="min-h-screen">
      <MapTilePreconnect />
      {regionHero ?? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Todos os spots' : 'All spots'}
          </Link>

          <div>
            <h1 className="font-display text-display-lg font-bold text-fg">{title}</h1>
            <p className="text-fg-muted mt-2 max-w-2xl">{description}</p>
          </div>
        </div>
      )}

      {regionHero && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Todos os spots' : 'All spots'}
          </Link>
        </div>
      )}

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
