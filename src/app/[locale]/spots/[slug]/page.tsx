import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText'
import { type ComponentProps } from 'react'
import { notFound } from 'next/navigation'
import { getSpotBySlug, spots } from '@/lib/spots'
import { locales, validateLocale } from '@/lib/i18n'
import { buildSpotMetadata } from '@/lib/seo'
import { loadEvents } from '@/lib/load-events'
import { loadSpotData } from '@/lib/load-spot-data'
import SpotDetailClient from '@/components/spots/SpotDetailClient'
import type { Metadata } from 'next'
import { fotoDoSpot } from '@/lib/spotFotos'
import { editorialDe } from '@/lib/spotEditorial'
import { spotTagEn } from '@/lib/spotTagsEn'
import type { Spot } from '@/types'

/** Spots a menos de 7 km (rótulos da praia em 3D), sem variantes do próprio spot. */
function vizinhosDe(spot: Spot, locale: string) {
  const kx = Math.cos((spot.lat * Math.PI) / 180)
  return spots
    .filter((s) => s.id !== spot.id && !s.id.startsWith(`${spot.id}-`) && !spot.id.startsWith(`${s.id}-`))
    .map((s) => ({ s, km: Math.hypot((s.lon - spot.lon) * kx, s.lat - spot.lat) * 111.32 }))
    .filter((x) => x.km <= 7)
    .sort((a, b) => a.km - b.km)
    .slice(0, 6)
    .map(({ s }) => ({ nome: localizedSpotName(s, locale), ll: [s.lon, s.lat] as [number, number] }))
}

type InitialData = NonNullable<ComponentProps<typeof SpotDetailClient>['initialData']>

// Body copy for es/de/fr falls through to EN (shell/hreflang MVP — see [locale]/layout.tsx).
export async function generateStaticParams() {
  return spots.flatMap((spot) =>
    locales.map((locale) => ({ locale, slug: spot.slug })),
  )
}

// D10 — params exaustivos: slug sem spot → 404 (produção: 404.html; dev: 404
// após o padrão aquecer — E443 a frio é upstream next.js#56253, dev-only).
export const dynamicParams = false

// FIX SEO2: Dynamic metadata per spot
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    return { title: 'Spot Not Found — VenTu' }
  }

  const isPt = locale === 'pt'
  const spotName = localizedSpotName(spot, locale)
  const regionName = localizedSpotRegion(spot, locale)

  return buildSpotMetadata(validateLocale(locale), slug, spotName, regionName)
}

export default async function SpotDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    notFound()
  }

  const events = await loadEvents()

  // Bake the spot data into the static HTML so the client renders the same
  // content it would have fetched — the old client-only load showed a skeleton
  // first, then swapped in the real page after hydration + fetch (CLS 0.44).
  // Static export data is immutable per build, so the baked snapshot is the
  // same data the client fetch would serve.
  // Build-time clock: the freshness gates (isObservedWaveFresh /
  // isObservedFresh) are evaluated at SSG with Date.now() = build time.
  // Thread the reference down so the client reproduces the exact baked
  // verdict on first paint; after mount SpotDetailClient switches to the
  // live clock (React #418 guard — see SpotDetailClient).
  const bakedAtMs = Date.now()

  const baked = loadSpotData().find((d) => d.spot.id === spot.id) ?? null
  const initialData: InitialData | null = baked
    ? {
        spot: baked.spot,
        conditions: baked.conditions,
        allScores: baked.allScores,
        // Rows are pipeline-guaranteed numeric; the client fetch path casts the
        // same arrays without normalizing.
        forecast: baked.forecast as InitialData['forecast'],
      }
    : null

  // Página v6 (#184): fotos (com substitutas marcadas), vizinhos e textos da praia
  // resolvidos no servidor — o cliente não carrega a lista de spots para isto.
  const isPt = locale === 'pt'
  const ed = editorialDe(spot)
  const hazards = spot.hazards?.length
    ? (isPt ? spot.hazards : spot.hazards.map(spotTagEn)).join('; ').toLowerCase()
    : null
  const v6 = {
    nome: localizedSpotName(spot, locale),
    local: localizedSpotRegion(spot, locale),
    fotos: { kite: fotoDoSpot(spot, 'kite'), surf: fotoDoSpot(spot, 'surf') },
    vizinhos: vizinhosDe(spot, locale),
    atencao: ed.atencao ? (isPt ? ed.atencao.pt : ed.atencao.en) : hazards,
    melhorMare: ed.melhorMare
      ? isPt
        ? ed.melhorMare.pt
        : ed.melhorMare.en
      : (isPt ? spot.localTips?.bestTide : spot.localTips?.bestTideEn ?? spot.localTips?.bestTide) ?? null,
  }

  return (
    <>
      <SpotDetailClient
        v6={v6}
        spot={spot}
        locale={locale}
        events={events}
        initialData={initialData ?? undefined}
        bakedAtMs={bakedAtMs}
      />
    </>
  )
}
