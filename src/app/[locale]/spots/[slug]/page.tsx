import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getSpotBySlug, spots } from '@/lib/spots'
import { locales } from '@/lib/i18n'
import { buildSpotMetadata } from '@/lib/seo'
import SpotDetailClient from '@/components/spots/SpotDetailClient'
import type { Metadata } from 'next'

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

  return (
    <Suspense fallback={null}>
      <SpotDetailClient spot={spot} locale={locale} />
    </Suspense>
  )
}
