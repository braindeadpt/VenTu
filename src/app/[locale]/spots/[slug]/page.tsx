import { notFound } from 'next/navigation'
import { getSpotBySlug, spots } from '@/lib/spots'
import SpotDetailClient from '@/components/spots/SpotDetailClient'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  return spots.flatMap((spot) => [
    { locale: 'pt', slug: spot.slug },
    { locale: 'en', slug: spot.slug },
  ])
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
  
  const title = `${spotName} — Condições | VenTu`
  const description = isPt
    ? `Condições em ${spotName}, ${regionName}. Ondas, vento e temperatura da água — actualizadas a cada 3 horas.`
    : `Conditions at ${spotName}, ${regionName}. Waves, wind and water temperature — updated every 3 hours.`

  return {
    title,
    description,
    keywords: [
      'surf', spot.type, spotName, regionName, 'Portugal',
      isPt ? 'condições Portugal' : 'conditions Portugal',
      isPt ? 'ondas vento' : 'waves wind',
    ],
    alternates: {
      canonical: `/${locale}/spots/${slug}`,
      languages: {
        'pt': `/pt/spots/${slug}`,
        'en': `/en/spots/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/spots/${slug}`,
      siteName: 'VenTu',
      type: 'website',
      locale: isPt ? 'pt_PT' : 'en_US',
    },
  }
}

export default async function SpotDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const spot = getSpotBySlug(slug)
  
  if (!spot) {
    notFound()
  }

  return <SpotDetailClient spot={spot} locale={locale} />
}
