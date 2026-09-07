import { loadSpotListings } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import MapTilePreconnect from '@/components/MapTilePreconnect'
import PageHeader from '@/components/ui/PageHeader'
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
import { validateLocale, pickLocale } from '@/lib/i18n'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = validateLocale(locale)

  const title = pickLocale(loc, {
    pt: `Todos os Spots — VenTu`,
    en: `All Spots — VenTu`,
    es: `Todos los spots — VenTu`,
    de: `Alle Spots — VenTu`,
    fr: `Tous les spots — VenTu`,
  })
  const description = pickLocale(loc, {
    pt: `Explora os ${SPOT_COUNT} spots de surf, kitesurf e windsurf em Portugal — condições ${pipelineSchedule('pt')}.`,
    en: `Browse all ${SPOT_COUNT} surf, kitesurf and windsurf spots in Portugal — conditions ${pipelineSchedule('en')}.`,
    es: `Explora los ${SPOT_COUNT} spots de surf, kitesurf y windsurf en Portugal — condiciones ${pipelineSchedule('es')}.`,
    de: `Entdecke alle ${SPOT_COUNT} Surf-, Kitesurf- und Windsurf-Spots in Portugal — Bedingungen ${pipelineSchedule('de')}.`,
    fr: `Parcours les ${SPOT_COUNT} spots de surf, kitesurf et windsurf au Portugal — conditions ${pipelineSchedule('fr')}.`,
  })

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
