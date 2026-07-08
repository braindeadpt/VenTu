import { locales } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { getTranslation } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Calendar, Waves, Wind, Thermometer, Sun, CloudRain } from 'lucide-react'
import MoonTideMonthStrip from '@/components/sazonalidade/MoonTideMonthStrip'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  return {
    title: isPt ? 'Sazonalidade — VenTu' : 'Seasonality — VenTu',
    description: isPt
      ? 'Descobre a melhor altura do ano para cada desporto náutico em Portugal.'
      : 'Discover the best time of year for each water sport in Portugal.',
  }
}

const seasonData = [
  {
    season: { pt: 'Inverno', en: 'Winter' },
    months: { pt: 'Dez–Fev', en: 'Dec–Feb' },
    icon: CloudRain,
    surf: { pt: 'Swell NW consistente. Melhor época para surf na costa oeste.', en: 'Consistent NW swell. Best season for surf on the west coast.' },
    kite: { pt: 'Vento fraco e irregular. Poucos dias de kitesurf.', en: 'Weak, irregular wind. Few kitesurf days.' },
    wind: { pt: 'Vento Sul ocasional. Pouco praticável.', en: 'Occasional S wind. Not very rideable.' },
    temp: { pt: 'Temp. água: 14–16°C. Wetsuit 4/3mm obrigatório.', en: 'Water temp: 14–16°C. 4/3mm wetsuit required.' },
  },
  {
    season: { pt: 'Primavera', en: 'Spring' },
    months: { pt: 'Mar–Mai', en: 'Mar–May' },
    icon: Sun,
    surf: { pt: 'Swell moderado. Ondas menores mas mais consistentes.', en: 'Moderate swell. Smaller but more consistent waves.' },
    kite: { pt: 'Nortada a começar. Dias de vento no norte.', en: 'Nortada wind starting. Windy days in the north.' },
    wind: { pt: 'Condições mistas. Vento térmico a aumentar.', en: 'Mixed conditions. Thermal wind increasing.' },
    temp: { pt: 'Temp. água: 14–17°C. Wetsuit 3/2mm.', en: 'Water temp: 14–17°C. 3/2mm wetsuit.' },
  },
  {
    season: { pt: 'Verão', en: 'Summer' },
    months: { pt: 'Jun–Set', en: 'Jun–Sep' },
    icon: Thermometer,
    surf: { pt: 'Swell pequeno. Ondas para principiantes. Costa sul funciona melhor.', en: 'Small swell. Beginner waves. South coast works best.' },
    kite: { pt: 'Nortada forte no norte. Melhor época para kitesurf e windsurf.', en: 'Strong Nortada in the north. Best season for kitesurf and windsurf.' },
    wind: { pt: 'Nortada previsível (20–30kt no norte). Condições de topo para downwind.', en: 'Predictable Nortada (20–30kt in the north). Top conditions for downwind.' },
    temp: { pt: 'Temp. água: 17–22°C. Wetsuit curto ou apenas rashguard.', en: 'Water temp: 17–22°C. Short wetsuit or rashguard only.' },
  },
  {
    season: { pt: 'Outono', en: 'Fall' },
    months: { pt: 'Out–Nov', en: 'Oct–Nov' },
    icon: Waves,
    surf: { pt: 'Swell a regressar. Ondas consistentes, multidões menores.', en: 'Swell returning. Consistent waves, smaller crowds.' },
    kite: { pt: 'Nortada a diminuir. Ainda alguns dias bons no início.', en: 'Nortada fading. Still some good days early on.' },
    wind: { pt: 'Vento variável. Boa janela para windsurf no sul.', en: 'Variable wind. Good windsurf window in the south.' },
    temp: { pt: 'Temp. água: 16–19°C. Wetsuit 3/2mm.', en: 'Water temp: 16–19°C. 3/2mm wetsuit.' },
  },
]

export default async function SazonalidadePage({ params }: Props) {
  const { locale } = await params
  const isPt = locale === 'pt'
  const t = getTranslation(locale as Locale)

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <Link href={`/${locale}/`} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {isPt ? 'Voltar' : 'Back'}
        </Link>

        <div className="flex items-center gap-4">
          <Calendar className="w-8 h-8 text-data-waves" />
          <div>
            <h1 className="text-3xl font-bold text-fg">{isPt ? 'Sazonalidade' : 'Seasonality'}</h1>
            <p className="text-fg-muted mt-1">
              {isPt
                ? 'Descobre a melhor altura do ano para cada desporto náutico em Portugal'
                : 'Discover the best time of year for each water sport in Portugal'}
            </p>
          </div>
        </div>

        <MoonTideMonthStrip locale={locale} />

        <div className="grid gap-6">
          {seasonData.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.season.en} className="bg-surface-1/[0.04] border border-divider rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-data-waves/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-data-waves" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-fg">{isPt ? s.season.pt : s.season.en}</h2>
                    <span className="text-sm text-fg-subtle">{isPt ? s.months.pt : s.months.en}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-data-waves">
                      <Waves className="w-4 h-4" /> Surf
                    </div>
                    <p className="text-sm text-fg-muted leading-relaxed">{isPt ? s.surf.pt : s.surf.en}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-data-wind">
                      <Wind className="w-4 h-4" /> Kitesurf
                    </div>
                    <p className="text-sm text-fg-muted leading-relaxed">{isPt ? s.kite.pt : s.kite.en}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-data-waves">
                      <Wind className="w-4 h-4" /> Windsurf
                    </div>
                    <p className="text-sm text-fg-muted leading-relaxed">{isPt ? s.wind.pt : s.wind.en}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-data-water">
                      <Thermometer className="w-4 h-4" /> {isPt ? 'Temperatura' : 'Temperature'}
                    </div>
                    <p className="text-sm text-fg-muted leading-relaxed">{isPt ? s.temp.pt : s.temp.en}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-surface-1/[0.04] border border-divider rounded-2xl p-6 text-center">
          <p className="text-sm text-fg-muted">
            {isPt
              ? 'Queres ver as condições agora?'
              : 'Want to see current conditions?'}
          </p>
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-2 mt-3 px-6 py-3 rounded-xl bg-data-waves text-bg-base font-medium hover:bg-data-waves/80 transition-colors"
          >
            {isPt ? 'Ver spots agora' : 'View spots now'}
          </Link>
        </div>
      </div>
    </div>
  )
}
