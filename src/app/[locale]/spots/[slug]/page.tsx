import { notFound } from 'next/navigation'
import { getSpotBySlug } from '@/lib/spots'
import { getTranslation } from '@/lib/i18n'
import { fetchMarineData, getCurrentConditions, getForecastData, getSportRating, getWaveRating } from '@/lib/openmeteo'
import { calculateSurfability, estimateCrowd, getScoreColor, getSessionForecast } from '@/lib/surfability'
import { getLocalTips, getSecretTips, blueFlagBeaches } from '@/lib/spotTips'
import ConditionCard from '@/components/weather/ConditionCard'
import ForecastChart from '@/components/weather/ForecastChart'
import SpotMap from '@/components/spots/SpotMap'
import { LocalTipsSection } from '@/components/spots/LocalTipsSection'
import { SecretTipsSection } from '@/components/spots/SecretTipsSection'
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge'
import { SessionForecastChart } from '@/components/spots/SessionForecastChart'
import SpotChat from '@/components/spots/SpotChat'
import { MapPin, Star, ArrowLeft, CheckCircle, AlertTriangle, Zap, Users } from 'lucide-react'
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
    rating = getSportRating(spot.type, current.waveHeight, current.windSpeed, current.wavePeriod, current.windDirection)
    waveRating = getWaveRating(current.waveHeight)
  } catch (e) {
    console.error(`Failed to load conditions for spot ${spot.name}:`, e)
  }

  // Calculate Surfability Score
  const surfability = calculateSurfability(spot, {
    waveHeight: current.waveHeight,
    wavePeriod: current.wavePeriod,
    waveDirection: current.waveDirection,
    windSpeed: current.windSpeed,
    windDirection: current.windDirection,
    waterTemp: current.waterTemp,
  })
  const scoreColors = getScoreColor(surfability.score)
  const crowd = estimateCrowd(surfability.score, false, false, spot.difficulty)

  // Get session forecast for next 12h
  let sessionForecast: any[] = []
  try {
    const marineData = await fetchMarineData(spot.lat, spot.lon)
    sessionForecast = getSessionForecast(spot, marineData.hourly)
  } catch (e) {
    console.error(`Failed to get session forecast for ${spot.name}:`, e)
  }

  // Get local tips and secret tips
  const spotLocalTips = getLocalTips(spot.slug)
  const spotSecretTips = getSecretTips(spot.slug)

  // Get water quality data
  const beachInfo = blueFlagBeaches[spot.slug]
  const spotWaterQuality = spot.waterQuality || beachInfo?.waterQuality
  const spotWaterQualityEn = spot.waterQualityEn || beachInfo?.waterQuality
  const hasBlueFlag = spot.blueFlag || !!beachInfo

  const difficultyLabels = {
    beginner: t.spots.beginner,
    intermediate: t.spots.intermediate,
    advanced: t.spots.advanced,
    expert: t.spots.expert,
    all: t.spots.allLevels,
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="space-y-4">
        <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t.spots.backToSpots}
        </Link>

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

            {/* Water Quality & Blue Flag Badges */}
            {(hasBlueFlag || spotWaterQuality || spot.accessibleBeach) && (
              <div className="mt-3">
                <WaterQualityBadge
                  blueFlag={hasBlueFlag}
                  waterQuality={spotWaterQuality as any}
                  waterQualityEn={spotWaterQualityEn as any}
                  accessibleBeach={spot.accessibleBeach}
                  locale={locale}
                />
              </div>
            )}
          </div>

          <div className="glass-card p-4 text-center">
            <div className="text-3xl font-bold text-ocean-400">{rating.rating}/10</div>
            <div className="text-sm text-white/50">{t.conditions.rating}</div>
          </div>
        </div>
      </div>

      {/* SURFABILITY SCORE CARD */}
      <div className={`glass-card p-6 ${scoreColors.border} border-2`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold">
                {isPt ? 'Surfability Score' : 'Surfability Score'}
              </h2>
            </div>
            <p className="text-lg text-white/80">
              {isPt ? surfability.recommendation : surfability.recommendationEn}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className={`text-5xl font-bold ${scoreColors.text}`}>
                {surfability.score}
              </div>
              <div className="text-sm text-white/50">/100</div>
            </div>

            <div className="text-center">
              <div className="flex gap-1 mb-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-5 h-5 ${i < surfability.stars ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'}`} />
                ))}
              </div>
              <div className="text-sm font-medium text-white/70">
                {isPt ? surfability.rating : surfability.ratingEn}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="text-center">
            <div className="text-sm text-white/50 mb-1">{isPt ? 'Ondas' : 'Waves'}</div>
            <div className="text-xl font-bold text-wave-400">{surfability.details.waveScore}</div>
            <div className="h-1.5 rounded-full bg-wave-500/20 mt-1">
              <div className="h-1.5 rounded-full bg-wave-400" style={{ width: `${surfability.details.waveScore}%` }} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-white/50 mb-1">{isPt ? 'Vento' : 'Wind'}</div>
            <div className="text-xl font-bold text-wind-400">{surfability.details.windScore}</div>
            <div className="h-1.5 rounded-full bg-wind-500/20 mt-1">
              <div className="h-1.5 rounded-full bg-wind-400" style={{ width: `${surfability.details.windScore}%` }} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-white/50 mb-1">{isPt ? 'Período' : 'Period'}</div>
            <div className="text-xl font-bold text-surf-400">{surfability.details.periodScore}</div>
            <div className="h-1.5 rounded-full bg-surf-500/20 mt-1">
              <div className="h-1.5 rounded-full bg-surf-400" style={{ width: `${surfability.details.periodScore}%` }} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-white/50 mb-1">{isPt ? 'Crowd Est.' : 'Crowd Est.'}</div>
            <div className="text-xl font-bold text-ocean-400">{crowd.icon}</div>
            <div className="text-xs text-white/50 mt-1">{isPt ? crowd.level : crowd.levelEn} ({crowd.count})</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bloco 1 - Condições meteorológicas */}
        <div className="glass-card p-6">
          <ConditionCard {...current} locale={locale} />
        </div>
        
        {/* Bloco 2 - Recomendação */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4">{t.conditions.recommendation}</h3>
          <p className="text-xl text-white/80 mb-4">{isPt ? rating.recommendation : rating.recommendationEn}</p>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <p className="text-sm text-white/50 mb-1">{t.spots.idealWind}</p>
              <p className="font-semibold">{spot.bestWind}</p>
            </div>
            <div>
              <p className="text-sm text-white/50 mb-1">{t.spots.idealSwell}</p>
              <p className="font-semibold">{spot.bestSwell}</p>
            </div>
          </div>
        </div>
        
        {/* Bloco 3 - Mapa */}
        <div className="glass-card p-4">
          <h4 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {t.map.location}
          </h4>
          <div className="h-48 rounded-xl overflow-hidden">
            <SpotMap lat={spot.lat} lon={spot.lon} locale={locale} />
          </div>
        </div>
      </div>

      <ForecastChart data={forecast.slice(0, 72)} locale={locale} />

      {/* Session Quality — Next 12h */}
      {sessionForecast.length > 0 && (
        <SessionForecastChart forecast={sessionForecast} locale={locale} />
      )}

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
        <h3 className="text-lg font-semibold mb-3">{t.spots.aboutSpot}</h3>
        <p className="text-white/70 leading-relaxed mb-4">{isPt ? spot.description : spot.descriptionEn}</p>

        {/* Local Tips */}
        {spotLocalTips && (
          <LocalTipsSection tips={spotLocalTips} locale={locale} />
        )}

        {/* Secret Tips — only for secret spots */}
        {spotSecretTips && (
          <div className="mt-4">
            <SecretTipsSection
              tips={spotSecretTips}
              locale={locale}
              secretLevel={spot.secretLevel}
            />
          </div>
        )}
      </div>
      {/* Chat por spot */}
      <SpotChat spotSlug={spot.slug} spotName={isPt ? spot.name : spot.nameEn} locale={locale} />
    </div>
  )
}