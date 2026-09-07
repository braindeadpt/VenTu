import { loadSpotListings } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import MapTilePreconnect from '@/components/MapTilePreconnect'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
import { getTranslation, validateLocale } from '@/lib/i18n'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = validateLocale(locale)
  const t = getTranslation(loc).spots
  const schedule = pipelineSchedule(loc)

  const title = t.metaTitle
  const description = t.metaDescription
    .replace('{count}', String(SPOT_COUNT))
    .replace('{schedule}', schedule)

  return buildPageMetadata({ title, description, locale: loc, path: `/${loc}/spots/` })
}

export default async function SpotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc = validateLocale(locale)
  const t = getTranslation(loc).spots
  const spotsData = loadSpotListings()
  const schedule = pipelineSchedule(loc)

  return (
    <div className="min-h-screen">
      <MapTilePreconnect />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={t.pageTitle}
          subtitle={t.pageSubtitle
            .replace('{count}', String(SPOT_COUNT))
            .replace('{schedule}', schedule)}
        />
      </div>

      <SpotGridClient
        spotsData={spotsData}
        locale={locale}
        regions={[...MACRO_REGIONS]}
      />
    </div>
  )
}
