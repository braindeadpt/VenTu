import { loadSpotListings } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  const loc = isPt ? 'pt' : 'en'

  const title = isPt ? `Todos os Spots — VenTu` : `All Spots — VenTu`
  const description = isPt
    ? `Explora os ${SPOT_COUNT} spots de surf, kitesurf e windsurf em Portugal — condições ${pipelineSchedule('pt')}.`
    : `Browse all ${SPOT_COUNT} surf, kitesurf and windsurf spots in Portugal — conditions ${pipelineSchedule('en')}.`

  return buildPageMetadata({ title, description, locale: loc, path: `/${loc}/spots/` })
}

export default async function SpotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const spotsData = loadSpotListings()

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={isPt ? 'Todos os Spots' : 'All Spots'}
          subtitle={
            isPt
              ? `${SPOT_COUNT} spots em Portugal — dados ${pipelineSchedule('pt')}`
              : `${SPOT_COUNT} spots in Portugal — data ${pipelineSchedule('en')}`
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
