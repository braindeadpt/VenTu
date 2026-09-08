import type { NewsItem } from '@/types'
import { loadNews } from '@/lib/load-news'
import { loadEvents } from '@/lib/load-events'
import { upcomingEvents } from '@/lib/events'
import NewsArchiveClient from '@/components/news/NewsArchiveClient'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { getTranslation, validateLocale } from '@/lib/i18n'
import type { Metadata } from 'next'
import { Newspaper } from 'lucide-react'

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
  const { locale: rawLocale } = await params
  const locale = validateLocale(rawLocale)
  const t = getTranslation(locale)
  const [news, events] = await Promise.all([loadNews(), loadEvents()])
  const hasUpcoming = upcomingEvents(events).length > 0

  if (news.length === 0 && !hasUpcoming) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-8 text-center sm:text-left">
          <h1 className="font-display text-2xl sm:text-3xl text-fg">{t.news.title}</h1>
          <p className="mt-2 text-fg-muted text-body">{t.news.subtitle}</p>
        </header>
        <EmptyState
          icon={<Newspaper className="w-7 h-7 text-fg-subtle" aria-hidden />}
          title={t.news.emptyTitle}
          description={t.news.emptyDescription}
          action={
            <Button variant="secondary" href={`/${locale}/spots/`} size="md">
              {t.news.emptyBrowseSpots}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NewsArchiveClient news={news as NewsItem[]} events={events} locale={locale} />
    </div>
  )
}
