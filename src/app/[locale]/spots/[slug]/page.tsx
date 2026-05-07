import { notFound } from 'next/navigation'
import { getSpotBySlug } from '@/lib/spots'
import { getTranslation } from '@/lib/i18n'
import { fetchMarineData, getCurrentConditions, getForecastData, getSportRating, getWaveRating } from '@/lib/openmeteo'
import ConditionCard from '@/components/weather/ConditionCard'
import ForecastChart from '@/components/weather/ForecastChart'
import { MapPin, Star, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const revalidate = 1800

export function generateStaticParams() {
  const { spots } = require('@/lib/spots')
  return spots.flatMap((spot: any) => [
    { locale: 'pt', slug: spot.slug },
    { locale: 'en', slug: spot.slug },
  ])
}

export default async function SpotDetailPage({ params }: { params: { locale: string; slug: string } }) {
  const { locale, slug } = params
  const spot = getSpotBySlug(slug)
  if (!spot) notFound()

  const t = getTranslation(locale as any)
  const isPt = locale === 'pt'

  let current = {
    waveHeight: 0,
    wavePeriod: 0,
    waveDirection: 0,
    windSpeed: 0,
    windDirection: 0,
    windGust: 0,
    waterTemp: 0,
  }
  let forecast: any[] = []
  let rating = {
    rating: 5,
    recommendation: 'Condições razoáveis',
    recommendationEn: 'Fair conditions',
  }
  let waveRating = getWaveRating(0)

  try {
    const marineData = await fetchMarineData(spot.lat, spot.lon)
    current = getCurrentConditions(marineData)
    forecast = getForecastData(marineData)
    rating = getSportRating(spot.type, current.waveHeight, current.windSpeed)
    waveRating = getWaveRating(current.waveHeight)
  } catch (e) {
    console.error(`Failed to load conditions for spot ${spot.name}:`, e)
  }

  const difficultyLabels = {
    beginner: t.spots.beginner,
    intermediate: t.spots.intermediate,
    advanced: t.spots.advanced,
    expert: t.spots.expert,
    all: 'Todos os níveis',
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="space-y-4">
        <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {isPt ? 'Voltar aos spots' : 'Back to spots'}
        </Link>

        {/* Hero Image */}
        {spot.images && spot.images.length > 0 && (
          <div className="relative w-full h-64 md:h-96 rounded-2xl overflow-hidden">
            <img
              src={spot.images[0]}
              alt={spot.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl md:text-5xl font-bold text-white/90">{isPt ? spot.name : spot.nameEn}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${waveRating.className}`}>
                {spot.type === 'big-wave' ? 'Big Wave' : spot.type.charAt(0).toUpperCase() + spot.type.slice(1)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/50">
              <MapPin className="w-4 h-4" />
              {isPt ? spot.region : spot.regionEn}
              <span className="mx-2">•</span>
              <Star className="w-4 h-4" />
              {difficultyLabels[spot.difficulty]}
            </div>
          </div>

          <div className="glass-card p-4 text-center">
            <div className="text-3xl font-bold text-ocean-400">{rating.rating}/10</div>
            <div className="text-sm text-white/50">{t.conditions.rating}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ConditionCard {...current} />
        </div>
        <div className="lg:col-span-2">
          <div className="glass-card p-6 h-full">
            <h3 className="text-lg font-semibold mb-4">{t.conditions.recommendation}</h3>
            <p className="text-xl text-white/80 mb-4">{isPt ? rating.recommendation : rating.recommendationEn}</p>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div>
                <p className="text-sm text-white/50 mb-1">{isPt ? 'Vento ideal' : 'Best wind'}</p>
                <p className="font-semibold">{spot.bestWind}</p>
              </div>
              <div>
                <p className="text-sm text-white/50 mb-1">{isPt ? 'Swell ideal' : 'Best swell'}</p>
                <p className="font-semibold">{spot.bestSwell}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ForecastChart data={forecast.slice(0, 72)} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-surf-400" />
            {t.spots.facilities}
          </h3>
          <ul className="space-y-2">
            {spot.facilities.map((f: string, i: number) => (
              <li key={i} className="flex items-center gap-2 text-white/70">
                <div className="w-1.5 h-1.5 rounded-full bg-surf-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-wind-400" />
            {t.spots.hazards}
          </h3>
          <ul className="space-y-2">
            {spot.hazards.map((h: string, i: number) => (
              <li key={i} className="flex items-center gap-2 text-white/70">
                <div className="w-1.5 h-1.5 rounded-full bg-wind-400" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-3">{isPt ? 'Sobre o spot' : 'About this spot'}</h3>
        <p className="text-white/70 leading-relaxed">{isPt ? spot.description : spot.descriptionEn}</p>
      </div>
    </div>
  )
}