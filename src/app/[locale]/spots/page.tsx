import { loadSpotData } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import PageHeader from '@/components/ui/PageHeader'
import { spots } from '@/lib/spots'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'

  const title = isPt ? `Todos os Spots — VenTu` : `All Spots — VenTu`
  const description = isPt
    ? `Explora os ${spots.length} spots de surf, kitesurf e windsurf em Portugal — condições actualizadas a cada 3 horas.`
    : `Browse all ${spots.length} surf, kitesurf and windsurf spots in Portugal — conditions updated every 3 hours.`

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/spots/`,
      languages: {
        pt: '/pt/spots/',
        en: '/en/spots/',
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/spots/`,
      siteName: 'VenTu',
      type: 'website',
      locale: isPt ? 'pt_PT' : 'en_US',
    },
  }
}

export default async function SpotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const spotsData = loadSpotData()

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={isPt ? 'Todos os Spots' : 'All Spots'}
          subtitle={
            isPt
              ? `${spots.length} spots em Portugal — dados actualizados a cada 3 horas`
              : `${spots.length} spots in Portugal — data updated every 3 hours`
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
