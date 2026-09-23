import { validateLocale } from '@/lib/i18n';
import { getTranslation } from '@/lib/i18n'
import { loadSpotListings } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import MapTilePreconnect from '@/components/MapTilePreconnect'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const loc = validateLocale(locale)

  const title = getTranslation(locale).pages.allSpotsMetaTitle
  const description = getTranslation(locale).pages.spotsMetaDescription
    .replace('{count}', String(SPOT_COUNT))
    .replace('{schedule}', pipelineSchedule(isPt ? 'pt' : 'en'))

  return buildPageMetadata({ title, description, locale: loc, path: `/${loc}/spots/` })
}

export default async function SpotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const spotsData = loadSpotListings()

  return (
    <div className="min-h-screen">
      <MapTilePreconnect />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={getTranslation(locale).pages.allSpotsTitle}
          subtitle={
            getTranslation(locale).pages.spotsSubtitle
              .replace('{count}', String(SPOT_COUNT))
              .replace('{schedule}', pipelineSchedule(locale))
          }
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
