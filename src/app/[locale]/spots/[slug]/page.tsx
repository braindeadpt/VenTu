import { notFound } from 'next/navigation'
import { getSpotBySlug, spots } from '@/lib/spots'
import SpotDetailClient from '@/components/spots/SpotDetailClient'

export async function generateStaticParams() {
  return spots.flatMap((spot) => [
    { locale: 'pt', slug: spot.slug },
    { locale: 'en', slug: spot.slug },
  ])
}

export default async function SpotDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    notFound()
  }

  return <SpotDetailClient spot={spot} locale={locale} />
}
