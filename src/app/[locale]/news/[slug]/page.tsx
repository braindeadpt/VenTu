import { getNewsBySlug, newsSlug, getRelatedNews } from '@/lib/news'
import type { NewsItem } from '@/types'
import { loadNews } from '@/lib/load-news'
import { locales, getTranslation, validateLocale, pickLocale } from '@/lib/i18n'
import { safeExternalUrl } from '@/lib/safeUrl'
import { jsonLdHtml } from '@/lib/jsonLd'
import NewsDetailHeader from '@/components/news/NewsDetailHeader'
import RelatedNews from '@/components/news/RelatedNews'
import { ExternalLink, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
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

// D10 — params exaustivos: slug sem notícia → 404 (produção: 404.html; dev:
// 404 após o padrão aquecer — E443 a frio é upstream next.js#56253, dev-only).
export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const allNews = await loadNews()
  const news = getNewsBySlug(allNews, slug)

  if (!news) return {}

  const title = pickLocale(locale, { pt: news.title, en: news.titleEn })
  const description = pickLocale(locale, { pt: news.summary, en: news.summaryEn })

  // Os artigos só têm texto pt/en (pipeline) — em es/de/fr a página serve o
  // inglês, ou seja conteúdo duplicado: fica noindex e fora dos hreflang.
  const duplicado = !['pt', 'en'].includes(locale);
  return {
    title: `${title} — VenTu`,
    description,
    ...(duplicado ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: `/${locale}/news/${slug}/`,
      languages: {
        pt: `/pt/news/${slug}/`,
        en: `/en/news/${slug}/`,
        'x-default': `/pt/news/${slug}/`,
      },
      types: {
        'application/rss+xml': [
          { url: '/rss.xml', title: 'VenTu — Notícias náuticas (PT)' },
          { url: '/rss-en.xml', title: 'VenTu News (EN)' },
        ],
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/news/${slug}/`,
      type: 'article',
      publishedTime: news.publishedAt,
      section: news.category,
    },
  }
}

export default async function NewsDetailPage({ params }: Props) {
  const { locale, slug } = await params
  const allNews = await loadNews()
  const news = getNewsBySlug(allNews, slug)

  if (!news) notFound()

  const related = getRelatedNews(allNews, news)
  const safeUrl = safeExternalUrl(news.url)

  const headline = pickLocale(locale, { pt: news.title, en: news.titleEn })
  const resumo = pickLocale(locale, { pt: news.summary, en: news.summaryEn })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description: resumo,
    datePublished: news.publishedAt,
    author: { '@type': 'Organization', name: news.source },
    publisher: { '@type': 'Organization', name: 'VenTu' },
    url: `https://ventu.surf/${locale}/news/${slug}/`,
    articleSection: news.category,
    // Língua real do texto servido: quando o pipeline repete o português nos
    // campos EN (ou a tradução falta), o conteúdo é pt-PT — anunciá-lo como
    // 'en' engana parsers e o Search Console.
    inLanguage: headline === news.title && resumo === news.summary ? 'pt-PT' : 'en',
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />

      {/* Back link */}
      <Link
        href={`/${locale}/news/`}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        {getTranslation(locale).news.backToNews}
      </Link>

      {/* Header */}
      <NewsDetailHeader news={news} locale={locale} />

      {/* Content */}
      <div className="mt-8 prose prose-sm max-w-none text-fg">
        <p className="text-body-lg leading-relaxed">
          {pickLocale(locale, { pt: news.summary, en: news.summaryEn })}
        </p>
      </div>

      {/* External link — only when the source URL is a safe http(s) link */}
      {safeUrl && (
        <div className="mt-8">
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-surface-2/[0.08] border border-divider text-fg font-medium hover:bg-surface-3/[0.12] transition-colors"
          >
            {getTranslation(locale).news.readOriginal}
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Related news */}
      <RelatedNews items={related} locale={locale} />
    </div>
  )
}
