import { getTranslation } from '@/lib/i18n'
import { spots } from '@/lib/spots'
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo'
import SpotGrid from '@/components/spots/SpotGrid'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'All Spots — WindSpot Portugal',
  description: 'Browse all 81 surf, kitesurf and windsurf spots in Portugal with real-time conditions.',
  openGraph: {
    title: 'All Spots — WindSpot Portugal',
    description: 'Browse all 81 surf, kitesurf and windsurf spots in Portugal.',
    url: 'https://braindeadpt.github.io/windspot-pt/spots',
    siteName: 'WindSpot Portugal',
    type: 'website',
  },
}


async function getAllConditions() {
  const conditions: Record<string, any> = {}
  await Promise.all(
    spots.map(async (spot) => {
      try {
        const data = await fetchMarineData(spot.lat, spot.lon)
        conditions[spot.id] = getCurrentConditions(data)
      } catch (e) {
        console.error(`Failed to fetch conditions for ${spot.name}`, e)
      }
    })
  )
  return conditions
}

export default async function SpotsPage({ params }: { params: { locale: string } }) {
  const { locale } = params
  const t = getTranslation(locale as any)
  const conditions = await getAllConditions()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white/90">{t.spots.title}</h1>
        <p className="text-white/50 mt-2">
          {locale === 'pt' ? `${spots.length} spots em Portugal com dados em tempo real` : `${spots.length} spots in Portugal with real-time data`}
        </p>
      </div>
      <SpotGrid spots={spots} locale={locale} conditions={conditions} />
    </div>
  )
}
