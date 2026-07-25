import type { NewsItem } from '@/types'
import { loadNews } from '@/lib/load-news'
import { loadEvents } from '@/lib/load-events'
import { upcomingEvents } from '@/lib/events'
import NewsArchiveClient from '@/components/news/NewsArchiveClient'
import { getTranslation } from '@/lib/i18n'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = getTranslation(locale)

  return {
    title: `${t.news.title} — VenTu`,
    description: t.news.subtitle,
    alternates: {
      canonical: `/${locale}/news/`,
      languages: {
        pt: '/pt/news/',
        en: '/en/news/',
        es: '/es/news/',
        de: '/de/news/',
        fr: '/fr/news/',
      },
    },
  }
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const [news, events] = await Promise.all([loadNews(), loadEvents()])
  const hasUpcoming = upcomingEvents(events).length > 0

  if (news.length === 0 && !hasUpcoming) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center py-16 space-y-4">
          <p className="text-fg-subtle text-lg">
            {locale === 'pt'
              ? 'Ainda não há notícias disponíveis. Volta mais tarde!'
              : 'No news available yet. Check back later!'}
          </p>
          <p className="text-fg-subtle/80 text-sm">
            {locale === 'pt'
              ? 'As notícias são actualizadas automaticamente via RSS.'
              : 'News are updated automatically via RSS.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NewsArchiveClient news={news as NewsItem[]} events={events} locale={locale} />
    </div>
  )
}
