import { getNewsBySlug, newsSlug, getRelatedNews } from '@/lib/news'
import type { NewsItem } from '@/types'
import { loadNews } from '@/lib/load-news'
import { locales } from '@/lib/i18n'
import NewsDetailHeader from '@/components/news/NewsDetailHeader'
import RelatedNews from '@/components/news/RelatedNews'
import { ExternalLink, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  const news = await loadNews()
  const params: { locale: string; slug: string }[] = []

  for (const locale of locales) {
    for (const item of news) {
      params.push({ locale, slug: newsSlug(item) })
    }
  }

  return params
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const isPt = locale === 'pt'
  const allNews = await loadNews()
  const news = getNewsBySlug(allNews, slug)

  if (!news) return {}

  const title = isPt ? news.title : news.titleEn
  const description = isPt ? news.summary : news.summaryEn

  return {
    title: `${title} — VenTu`,
    description,
    alternates: {
      canonical: `/${locale}/news/${slug}`,
      languages: {
        'pt': `/pt/news/${slug}`,
        'en': `/en/news/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/news/${slug}`,
      type: 'article',
      publishedTime: news.publishedAt,
      section: news.category,
    },
  }
}

export default async function NewsDetailPage({ params }: Props) {
  const { locale, slug } = await params
  const isPt = locale === 'pt'
  const allNews = await loadNews()
  const news = getNewsBySlug(allNews, slug)

  if (!news) notFound()

  const related = getRelatedNews(allNews, news)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: isPt ? news.title : news.titleEn,
    description: isPt ? news.summary : news.summaryEn,
    datePublished: news.publishedAt,
    author: { '@type': 'Organization', name: news.source },
    publisher: { '@type': 'Organization', name: 'VenTu' },
    url: `https://ventu.surf/${locale}/news/${slug}`,
    articleSection: news.category,
    inLanguage: locale,
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Back link */}
      <Link
        href={`/${locale}/news`}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        {isPt ? 'Voltar às notícias' : 'Back to news'}
      </Link>

      {/* Header */}
      <NewsDetailHeader news={news} locale={locale} />

      {/* Content */}
      <div className="mt-8 prose prose-sm max-w-none text-fg">
        <p className="text-body-lg leading-relaxed">
          {isPt ? news.summary : news.summaryEn}
        </p>
      </div>

      {/* External link */}
      <div className="mt-8">
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-surface-2 border border-divider text-fg font-medium hover:bg-surface-3 transition-colors"
        >
          {isPt ? 'Ler artigo original' : 'Read original article'}
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Related news */}
      <RelatedNews items={related} locale={locale} />
    </div>
  )
}
