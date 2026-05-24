import { loadSpotData } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import { spots } from '@/lib/spots'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'

  const title = isPt ? `Todos os Spots — VenTu` : `All Spots — VenTu`
  const description = isPt
    ? `Explora os ${spots.length} spots de surf, kitesurf e windsurf em Portugal com condições em tempo real.`
    : `Browse all ${spots.length} surf, kitesurf and windsurf spots in Portugal with real-time conditions.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://ventu.surf/${locale}/spots/`,
      siteName: 'VenTu',
      type: 'website',
      locale: isPt ? 'pt_PT' : 'en_US',
    },
    alternates: {
      canonical: `/${locale}/spots/`,
      languages: {
        pt: '/pt/spots/',
        en: '/en/spots/',
      },
    },
  }
}

export default async function SpotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const spotsData = loadSpotData()

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-2">
        <h1 className="text-4xl font-bold text-fg">
          {isPt ? 'Todos os Spots' : 'All Spots'}
        </h1>
        <p className="text-fg-muted">
          {isPt
            ? `${spots.length} spots em Portugal com dados em tempo real`
            : `${spots.length} spots in Portugal with real-time data`}
        </p>
      </div>

      <SpotGridClient
        spotsData={spotsData}
        locale={locale}
        regions={[...MACRO_REGIONS]}
      />
    </div>
  )
}
