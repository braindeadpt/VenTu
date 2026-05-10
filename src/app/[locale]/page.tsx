import DawnPatrolBanner from '@/components/DawnPatrolBanner'
import { AlertBanner } from '@/components/AlertBanner'
import { getTranslation } from '@/lib/i18n'
import { spots } from '@/lib/spots'
import { fetchMarineData, getCurrentConditions, getForecastData } from '@/lib/openmeteo'
import { calculateSurfability, getSessionForecast, estimateCrowd, getScoreColor } from '@/lib/surfability'
import { calculateSportRating, SPORT_LABELS, SportType, getCompatibleSports } from '@/lib/sportRatings'
import SpotGrid from '@/components/spots/SpotGrid'
import SportSelector from '@/components/SportSelector'
import { Wind, Waves, MapPin, ArrowRight, Activity, Thermometer, Star, Zap, Flame, Sunrise, Users } from 'lucide-react'
import Link from 'next/link'

export const revalidate = 1800

function isSpotCompatibleWithSport(spot: any, sport: SportType): boolean {
  const typeMapping: Record<string, SportType[]> = {
    surf: ['surf', 'bodyboard', 'sup'],
    kitesurf: ['kitesurf', 'windsurf'],
    windsurf: ['windsurf', 'kitesurf'],
    'big-wave': ['surf', 'bodyboard', 'windsurf'],
    foil: ['windsurf', 'kitesurf', 'sup'],
    multisport: ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'wakeboard'],
    wakeboard: ['wakeboard'],
  }
  const compatible = typeMapping[spot.type] || ['surf']
  return compatible.includes(sport)
}

async function getAllConditions(selectedSport?: SportType) {
  const conditions: Record<string, any> = {}
  const surfabilityScores: Record<string, any> = {}
  const sportRatings: Record<string, Record<string, any>> = {}

  await Promise.all(
    spots.map(async (spot) => {
      try {
        const data = await fetchMarineData(spot.lat, spot.lon)
        const current = getCurrentConditions(data)
        conditions[spot.id] = current

        const score = calculateSurfability(spot, {
          waveHeight: current.waveHeight,
          wavePeriod: current.wavePeriod,
          waveDirection: current.waveDirection,
          windSpeed: current.windSpeed,
          windDirection: current.windDirection,
          waterTemp: current.waterTemp,
        })
        surfabilityScores[spot.id] = score

        sportRatings[spot.id] = {}
        const compatibleSports = spot.compatibleSports?.length 
          ? spot.compatibleSports 
          : getCompatibleSports(current.waveHeight, current.windSpeed, current.wavePeriod)
        
        compatibleSports.forEach((sport: SportType) => {
          sportRatings[spot.id][sport] = calculateSportRating(
            sport,
            current.waveHeight,
            current.wavePeriod,
            current.windSpeed,
            current.windDirection
          )
        })
      } catch (e) {
        console.error(`Failed to fetch conditions for ${spot.name}`, e)
      }
    })
  )

  return { conditions, surfabilityScores, sportRatings }
}

function getTopSpots(
  surfabilityScores: Record<string, any>, 
  sportRatings: Record<string, Record<string, any>>,
  selectedSport?: SportType,
  limit = 3
) {
  const scores = selectedSport && sportRatings
    ? Object.entries(sportRatings)
        .filter(([id, ratings]) => ratings[selectedSport])
        .map(([id, ratings]) => ({
          id,
          score: ratings[selectedSport].rating * 10,
          sportRating: ratings[selectedSport],
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    : Object.entries(surfabilityScores)
        .sort(([, a], [, b]) => b.score - a.score)
        .slice(0, limit)
        .map(([id, score]) => ({ id, score, sportRating: null }))

  return scores.map(({ id, score, sportRating }) => ({
    spot: spots.find(s => s.id === id)!,
    score: sportRating || score,
    sportRating,
  })).filter(item => item.spot)
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const { locale } = params
  const t = getTranslation(locale as any)
  const { conditions, surfabilityScores, sportRatings } = await getAllConditions()

  const topSpots = getTopSpots(surfabilityScores, sportRatings, undefined, 3)
  const isPt = locale === 'pt'

  const filteredSpots = spots

  const bestSpot = topSpots[0]
  const bestConditions = bestSpot ? conditions[bestSpot.spot.id] : null

  return (
    <div className="space-y-16">
      {/* HERO — Onde está a boa onda? */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-ocean-900/50 to-ocean-950" />
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,50 Q20,35 40,50 T80,50 T100,50" fill="none" stroke="white" strokeWidth="0.5">
              <animate attributeName="d" dur="4s" repeatCount="indefinite"
                values="M0,50 Q20,35 40,50 T80,50 T100,50;M0,50 Q20,45 40,50 T80,50 T100,50;M0,50 Q20,35 40,50 T80,50 T100,50"/>
            </path>
            <path d="M0,60 Q25,45 50,60 T100,60" fill="none" stroke="white" strokeWidth="0.5" opacity="0.5">
              <animate attributeName="d" dur="5s" repeatCount="indefinite"
                values="M0,60 Q25,45 50,60 T100,60;M0,60 Q25,55 50,60 T100,60;M0,60 Q25,45 50,60 T100,60"/>
            </path>
            <path d="M0,70 Q30,55 60,70 T100,70" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3">
              <animate attributeName="d" dur="6s" repeatCount="indefinite"
                values="M0,70 Q30,55 60,70 T100,70;M0,70 Q30,65 60,70 T100,70;M0,70 Q30,55 60,70 T100,70"/>
            </path>
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ocean-500/10 border border-ocean-500/20 text-ocean-300 text-sm font-medium animate-pulse">
              <Flame className="w-4 h-4" />
              {isPt ? 'Dados em tempo real para Locals' : 'Real-time data for Locals'}
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="text-gradient">WindSpot</span>
            </h1>

            {/* Dynamic subtitle based on best spot */}
            <p className="text-2xl md:text-3xl text-white/80 max-w-3xl mx-auto leading-relaxed font-medium">
              {bestSpot ? (
                isPt
                  ? <>Hoje é dia de <span className="text-ocean-400 font-bold">{bestSpot.spot.name}</span>! {bestSpot.score.rating}</>
                  : <>Today is <span className="text-ocean-400 font-bold">{bestSpot.spot.name}</span> day! {bestSpot.score.ratingEn}</>
              ) : t.hero.subtitle}
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 px-8 py-4 bg-ocean-500 hover:bg-ocean-600 text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-ocean-500/25">
                <Zap className="w-5 h-5" />
                {isPt ? 'Ver Onde Está a Boa Onda' : 'Find the Best Waves'}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

  // Re-enable banners after hydration fix
  {/* ALERTS BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <AlertBanner locale={locale} />
      </section>

      {/* DAWN PATROL AI ADVISOR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <DawnPatrolBanner locale={locale} />
      </section>

      {/* SPORT SELECTOR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <SportSelector locale={locale} />
      </section>

      {/* TOP 3 SPOTS — Onde está a boa onda hoje? */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Flame className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white/90">
              {isPt ? 'TOP 3 — Onde Está a Boa Onda?' : 'TOP 3 — Where Are the Best Waves?'}
            </h2>
            <p className="text-white/50 text-sm">{isPt ? 'Scores calculados agora mesmo 🤖' : 'Scores calculated just now 🤖'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topSpots.map(({ spot, score, sportRating }, index) => {
            const isSportMode = !!sportRating
            const ratingScore = isSportMode ? sportRating.rating : score.score / 10
            const ratingLabel = isSportMode 
              ? (isPt ? sportRating.label : sportRating.label)
              : (isPt ? score.rating : score.ratingEn)
            const colors = isSportMode 
              ? { bg: `bg-[${sportRating.color}]/20`, text: `text-[${sportRating.color}]`, border: `border-[${sportRating.color}]/30` }
              : getScoreColor(score.score)
            
            return (
              <Link
                key={spot.id}
                href={`/${locale}/spots/${spot.slug}`}
                className={`glass-card p-5 hover:scale-[1.02] transition-all cursor-pointer group ${colors.border} border`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${colors.bg} ${colors.text}`}>
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white/90 group-hover:text-ocean-300 transition-colors">
                        {isPt ? spot.name : spot.nameEn}
                      </h3>
                      <p className="text-sm text-white/50">{isPt ? spot.region : spot.regionEn}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${colors.bg} ${colors.text}`}>
                    {isSportMode ? `${sportRating.rating?.toFixed(1) || '—'}/10` : `${score.score || '—'}/100`}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < Math.round(ratingScore / 2) ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'}`} />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-white/70">
                    {isSportMode 
                      ? (isPt ? 'Ver condições' : 'See conditions')
                      : ratingLabel
                    }
                  </span>
                </div>

                <p className="text-sm text-white/60 mb-3">
                  {isSportMode 
                    ? (isPt ? sportRating.description : sportRating.description)
                    : (isPt ? score.recommendation : score.recommendationEn)
                  }
                </p>

                {/* Sport compatibility badges */}
                {!isSportMode && sportRatings[spot.id] && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {Object.entries(sportRatings[spot.id])
                      .sort(([, a], [, b]) => b.rating - a.rating)
                      .slice(0, 3)
                      .map(([sport, rating]) => (
                        <span 
                          key={sport}
                          className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300"
                          style={{ borderColor: rating.color }}
                        >
                          {SPORT_LABELS[sport as SportType].emoji} {rating.rating?.toFixed(0) || '—'}
                        </span>
                      ))
                    }
                  </div>
                )}

                {/* Mini conditions */}
                <div className="flex gap-3 text-xs text-white/50">
                  <span className="flex items-center gap-1">
                    <Waves className="w-3 h-3" />
                    {conditions[spot.id]?.waveHeight?.toFixed(1) || '—'}m
                  </span>
                  <span className="flex items-center gap-1">
                    <Wind className="w-3 h-3" />
                    {conditions[spot.id]?.windSpeed?.toFixed(0) || '—'}km/h
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {isSportMode 
                      ? (isPt ? 'Ver condições' : 'See conditions')
                      : estimateCrowd(score.score, false, false, spot.difficulty).level
                    }
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* MAPA INTERATIVO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-ocean-500/10">
            <MapPin className="w-6 h-6 text-ocean-400" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white/90">
              {isPt ? 'Mapa dos Spots' : 'Spots Map'}
            </h2>
            <p className="text-white/50 text-sm">{isPt ? `Clique num spot para ver detalhes` : `Click a spot for details`}</p>
          </div>
        </div>

        <div className="glass-card p-6 relative overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredSpots.map((spot) => {
              const score = surfabilityScores[spot.id]
              const sportRating = sportRatings[spot.id]
              const displayScore = sportRating ? sportRating.rating : (score?.score || 0)
              const maxScore = sportRating ? 10 : 100
              const colors = score ? getScoreColor(score.score) : { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', glow: '' }
              
              return (
                <Link
                  key={spot.id}
                  href={`/${locale}/spots/${spot.slug}`}
                  className={`p-3 rounded-xl ${colors.bg} ${colors.border} border hover:scale-105 transition-all group`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-white/90 group-hover:text-ocean-300 transition-colors">
                      {isPt ? spot.name : spot.nameEn}
                    </span>
                    {sportRating && (
                      <span className="text-xs font-bold" style={{ color: sportRating.color }}>
                        {sportRating.rating?.toFixed(1) || '—'}
                      </span>
                    )}
                    {!sportRating && score && (
                      <span className={`text-xs font-bold ${colors.text}`}>
                        {score.score}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/50">{isPt ? spot.region : spot.regionEn}</div>
                  {score && (
                    <div className="mt-2 flex items-center gap-1">
                      <div 
                        className={`h-1.5 rounded-full flex-1 ${score.score >= 60 ? 'bg-gradient-to-r from-green-400 to-yellow-400' : 'bg-gray-500/30'}`} 
                        style={{ opacity: sportRating ? sportRating.rating / 10 : score.score / 100 }} 
                      />
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* CONDIÇÕES GERAIS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-wave-500/10">
              <Activity className="w-6 h-6 text-wave-400" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white/90">
              {isPt ? 'Condições em Destaque' : 'Conditions Highlight'}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-wave-500/10">
                <Waves className="w-6 h-6 text-wave-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{isPt ? 'Swell' : 'Swell'}</p>
                <p className="text-xl font-bold">
                  {bestConditions?.waveHeight?.toFixed(1) || '—'}m
                  <span className="text-sm text-white/50 font-normal ml-1">
                    @{bestConditions?.wavePeriod?.toFixed(0) || '—'}s
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-wind-500/10">
                <Wind className="w-6 h-6 text-wind-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{isPt ? 'Vento' : 'Wind'}</p>
                <p className="text-xl font-bold">
                  {bestConditions?.windSpeed?.toFixed(0) || '—'}km/h
                  <span className="text-sm text-white/50 font-normal ml-1">
                    {bestConditions?.windGust?.toFixed(0) || '—'}kt gust
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-surf-500/10">
                <Thermometer className="w-6 h-6 text-surf-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{isPt ? 'Água' : 'Water'}</p>
                <p className="text-xl font-bold">{bestConditions?.waterTemp?.toFixed(1) || '—'}°C</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-ocean-500/10">
                <Sunrise className="w-6 h-6 text-ocean-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{isPt ? 'Dawn Patrol' : 'Dawn Patrol'}</p>
                <p className="text-xl font-bold">6:15h</p>
                <p className="text-xs text-white/50">{isPt ? 'Nascer do sol' : 'Sunrise'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TODOS OS SPOTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white/90">
              {t.spots.title}
            </h2>
            <p className="text-white/50 mt-1">
              {t.hero.featured}
            </p>
          </div>
          <Link href={`/${locale}/spots/`} className="flex items-center gap-2 text-ocean-400 hover:text-ocean-300 transition-colors">
            {t.hero.viewAll}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <SpotGrid 
          spots={filteredSpots.slice(0, 6)} 
          locale={locale} 
          conditions={conditions} 
          sportRatings={sportRatings}
        />
      </section>

      {/* STATS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="glass-card p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-ocean-400">{spots.length}</div>
              <div className="text-sm text-white/50">{t.hero.stats.spots}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-surf-400">48</div>
              <div className="text-sm text-white/50">{t.hero.stats.updates}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-wind-400">6</div>
              <div className="text-sm text-white/50">{t.hero.stats.sports}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-yellow-400">🤙</div>
              <div className="text-sm text-white/50">{isPt ? 'Feito por Locals' : 'Made by Locals'}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
