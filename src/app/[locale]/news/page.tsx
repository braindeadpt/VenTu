import { getTranslation } from '@/lib/i18n'
import { NewsItem } from '@/types'
import NewsCard from '@/components/news/NewsCard'
import { Newspaper } from 'lucide-react'

const mockNews: NewsItem[] = [
  {
    id: '1',
    title: 'Nazaré Tow Surfing Challenge anunciado para janeiro',
    titleEn: 'Nazare Tow Surfing Challenge announced for January',
    summary: 'A WSL confirmou as datas do evento de big wave em Nazaré. As condições meteorológicas prometem ondas gigantescas para a competição.',
    summaryEn: 'WSL confirmed the dates for the big wave event in Nazare. Weather conditions promise giant waves for the competition.',
    category: 'competition',
    source: 'SurferToday',
    url: 'https://surfertoday.com',
    publishedAt: '2026-01-15T10:00:00Z',
    tags: ['nazare', 'big-wave', 'wsl']
  },
  {
    id: '2',
    title: 'Guincho: Nortada forte prevista para o fim de semana',
    titleEn: 'Guincho: Strong Nortada wind forecast for weekend',
    summary: 'Vento Norte de 25-30 nós previsto para sábado e domingo. Ideal para kitesurf e windsurf.',
    summaryEn: 'North wind of 25-30 knots forecast for Saturday and Sunday. Ideal for kitesurf and windsurf.',
    category: 'kitesurf',
    source: 'WindMag',
    url: 'https://windmag.com',
    publishedAt: '2026-01-14T08:00:00Z',
    tags: ['guincho', 'kitesurf', 'wind']
  },
  {
    id: '3',
    title: 'Novo recorde de temperatura da água no Algarve',
    titleEn: 'New water temperature record in Algarve',
    summary: 'A água do mar atingiu 19°C em janeiro, um valor atípico para a época. Impacto nas condições de surf.',
    summaryEn: 'Sea water reached 19°C in January, an unusual value for the season. Impact on surf conditions.',
    category: 'general',
    source: 'TheKiteMag',
    url: 'https://thekitemag.com',
    publishedAt: '2026-01-13T14:00:00Z',
    tags: ['algarve', 'temperature', 'climate']
  },
  {
    id: '4',
    title: 'Peniche recebe etapa do WSL Championship Tour',
    titleEn: 'Peniche hosts WSL Championship Tour event',
    summary: 'Supertubos será palco da competição de surf mais importante do mundo. Preparações já começaram.',
    summaryEn: 'Supertubos will host the most important surf competition in the world. Preparations have already begun.',
    category: 'competition',
    source: 'WSL',
    url: 'https://wsl.com',
    publishedAt: '2026-01-12T09:00:00Z',
    tags: ['peniche', 'wsl', 'supertubos']
  },
  {
    id: '5',
    title: 'Alerta de ressaca na costa oeste',
    titleEn: 'Swell alert on the west coast',
    summary: 'Ondas de 4-5 metros previstas para a próxima semana. Cuidado redobrado nas praias expostas.',
    summaryEn: 'Waves of 4-5 meters forecast for next week. Extra caution on exposed beaches.',
    category: 'safety',
    source: 'IPMA',
    url: 'https://ipma.pt',
    publishedAt: '2026-01-11T16:00:00Z',
    tags: ['safety', 'swell', 'west-coast']
  },
  {
    id: '6',
    title: 'Nova escola de kitesurf abre em Foz do Arelho',
    titleEn: 'New kitesurf school opens in Foz do Arelho',
    summary: 'A lagoa de Óbidos ganha mais uma escola de kitesurf com foco em iniciantes e famílias.',
    summaryEn: 'Obidos Lagoon gains another kitesurf school focused on beginners and families.',
    category: 'kitesurf',
    source: 'SurferToday',
    url: 'https://surfertoday.com',
    publishedAt: '2026-01-10T11:00:00Z',
    tags: ['foz-do-arelho', 'kitesurf', 'school']
  }
]

export default async function NewsPage({ params }: { params: { locale: string } }) {
  const { locale } = params
  const t = getTranslation(locale as any)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="flex items-center gap-4">
        <Newspaper className="w-8 h-8 text-ocean-400" />
        <div>
          <h1 className="text-4xl font-bold text-white/90">{t.news.title}</h1>
          <p className="text-white/50 mt-1">
            {locale === 'pt' ? 'Notícias automáticas sobre desportos náuticos' : 'Automated news about water sports'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockNews.map((news) => (
          <NewsCard key={news.id} news={news} locale={locale} />
        ))}
      </div>
    </div>
  )
}
