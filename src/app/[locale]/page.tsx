import { getTranslation } from '@/lib/i18n'
import { spots } from '@/lib/spots'
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo'
import SpotGrid from '@/components/spots/SpotGrid'
import { Wind, Waves, MapPin, ArrowRight, Activity, Thermometer } from 'lucide-react'
import Link from 'next/link'

export const revalidate = 1800

async function getAllConditions() {
  const conditions: Record<string, any> = {}
  await Promise.all(
    spots.slice(0, 6).map(async (spot) => {
      try {
        const data = await fetchMarineData(spot.lat, spot.lon)
        conditions[spot.id] = getCurrentConditions(data)
      } catch (e) {
        console.error(`Failed to fetch conditions for ${spot.name}`, e)
      }
    })
  )
  return conditions
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const { locale } = params
  const t = getTranslation(locale as any)
  const conditions = await getAllConditions()
  const featuredSpots = spots.slice(0, 6)

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-ocean-900/50 to-ocean-950" />
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,50 Q25,30 50,50 T100,50" fill="none" stroke="white" strokeWidth="0.5"/>
            <path d="M0,60 Q25,40 50,60 T100,60" fill="none" stroke="white" strokeWidth="0.5"/>
            <path d="M0,70 Q25,50 50,70 T100,70" fill="none" stroke="white" strokeWidth="0.5"/>
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ocean-500/10 border border-ocean-500/20 text-ocean-300 text-sm font-medium">
              <Activity className="w-4 h-4" />
              {locale === 'pt' ? 'Dados em tempo real' : 'Real-time data'}
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="text-gradient">WindSpot</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              {t.hero.subtitle}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 px-8 py-4 bg-ocean-500 hover:bg-ocean-600 text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-ocean-500/25">
                {t.hero.cta}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href={`/${locale}/news/`} className="inline-flex items-center gap-2 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold transition-all border border-white/10">
                {t.news.title}
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-ocean-400">{spots.length}</div>
                <div className="text-sm text-white/50">{t.hero.stats.spots}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-surf-400">48</div>
                <div className="text-sm text-white/50">{t.hero.stats.updates}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-wind-400">6</div>
                <div className="text-sm text-white/50">{t.hero.stats.sports}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white/90">{t.spots.title}</h2>
            <p className="text-white/50 mt-1">{locale === 'pt' ? 'Spots em destaque' : 'Featured spots'}</p>
          </div>
          <Link href={`/${locale}/spots/`} className="flex items-center gap-2 text-ocean-400 hover:text-ocean-300 transition-colors">
            {locale === 'pt' ? 'Ver todos' : 'View all'}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <SpotGrid spots={featuredSpots} locale={locale} conditions={conditions} />
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-card p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-wave-500/10">
                <Waves className="w-6 h-6 text-wave-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{locale === 'pt' ? 'Altura Média' : 'Avg Wave'}</p>
                <p className="text-xl font-bold">1.2m</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-wind-500/10">
                <Wind className="w-6 h-6 text-wind-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{locale === 'pt' ? 'Vento Médio' : 'Avg Wind'}</p>
                <p className="text-xl font-bold">14kt</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-surf-500/10">
                <Thermometer className="w-6 h-6 text-surf-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{locale === 'pt' ? 'Temp. Água' : 'Water Temp'}</p>
                <p className="text-xl font-bold">16°C</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-ocean-500/10">
                <MapPin className="w-6 h-6 text-ocean-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">{locale === 'pt' ? 'Melhor Spot' : 'Best Spot'}</p>
                <p className="text-xl font-bold">Peniche</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
