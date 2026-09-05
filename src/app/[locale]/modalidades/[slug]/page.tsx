import { loadSpotListings } from '@/lib/load-spot-data'
import { MACRO_REGIONS } from '@/lib/regions'
import { SpotGridClient } from '@/components/spots/SpotGridClient'
import MapTilePreconnect from '@/components/MapTilePreconnect'
import { locales } from '@/lib/i18n'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'

const VALID_SLUGS = ['surf', 'kitesurf', 'windsurf', 'big-wave', 'bodyboard', 'sup', 'foil', 'wakeboard']

const sportNames: Record<string, { pt: string; en: string }> = {
  surf:      { pt: 'Surf',      en: 'Surf' },
  kitesurf:  { pt: 'Kitesurf',  en: 'Kitesurf' },
  windsurf:  { pt: 'Windsurf',  en: 'Windsurf' },
  'big-wave':{ pt: 'Big Wave',  en: 'Big Wave' },
  bodyboard: { pt: 'Bodyboard', en: 'Bodyboard' },
  sup:       { pt: 'SUP',       en: 'SUP' },
  foil:      { pt: 'Foil',       en: 'Foil' },
  wakeboard: { pt: 'Wakeboard', en: 'Wakeboard' },
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = []
  for (const locale of locales) {
    for (const slug of VALID_SLUGS) {
      params.push({ locale, slug })
    }
  }
  return params
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const isPt = locale === 'pt'
  const name = sportNames[slug]
  if (!name) return {}
  const title = isPt ? `${name.pt} — Modalidades — VenTu` : `${name.en} — Modalities — VenTu`
  return {
    title,
    description: isPt
      ? `Spots de ${name.pt.toLowerCase()} em Portugal. Condições ${pipelineSchedule('pt')}, previsões e scores náuticos.`
      : `${name.en} spots in Portugal. Conditions ${pipelineSchedule('en')}, forecasts and nautical scores.`,
  }
}

export default async function ModalidadePage({ params }: Props) {
  const { locale, slug } = await params
  const isPt = locale === 'pt'
  const name = sportNames[slug]
  if (!name) notFound()

  const spotsData = loadSpotListings()
  const filteredSpots = spotsData

  return (
    <div className="min-h-screen">
      <MapTilePreconnect />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          href={`/${locale}/`}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isPt ? 'Voltar' : 'Back'}
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-fg">{isPt ? name.pt : name.en}</h1>
          <p className="text-fg-muted mt-1">
            {isPt
              ? `Spots de ${name.pt.toLowerCase()} em Portugal — condições ${pipelineSchedule('pt')}`
              : `${name.en} spots in Portugal — conditions ${pipelineSchedule('en')}`}
          </p>
        </div>
      </div>

      <SpotGridClient
        spotsData={filteredSpots}
        locale={locale}
        regions={[...MACRO_REGIONS]}
        initialSport={slug}
        initialRegion={undefined}
      />
    </div>
  )
}
