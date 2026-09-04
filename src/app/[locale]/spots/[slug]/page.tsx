import { Suspense, type ComponentProps } from 'react'
import { notFound } from 'next/navigation'
import { getSpotBySlug, spots } from '@/lib/spots'
import { locales } from '@/lib/i18n'
import { buildSpotMetadata } from '@/lib/seo'
import { loadEvents } from '@/lib/load-events'
import { loadSpotData } from '@/lib/load-spot-data'
import SpotDetailClient from '@/components/spots/SpotDetailClient'
import type { Metadata } from 'next'

type InitialData = NonNullable<ComponentProps<typeof SpotDetailClient>['initialData']>

// Body copy for es/de/fr falls through to EN (shell/hreflang MVP — see [locale]/layout.tsx).
export async function generateStaticParams() {
  return spots.flatMap((spot) =>
    locales.map((locale) => ({ locale, slug: spot.slug })),
  )
}

// FIX SEO2: Dynamic metadata per spot
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    return { title: 'Spot Not Found — VenTu' }
  }

  const isPt = locale === 'pt'
  const spotName = isPt ? spot.name : spot.nameEn
  const regionName = isPt ? spot.region : spot.regionEn

  return buildSpotMetadata(isPt ? 'pt' : 'en', slug, spotName, regionName)
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

  return (
    <Suspense fallback={null}>
      <SpotDetailClient
        spot={spot}
        locale={locale}
        events={events}
        initialData={initialData ?? undefined}
      />
    </Suspense>
  )
}
