import type { NewsItem } from '@/types';
import { Sparkles, Calendar } from 'lucide-react';
import Link from 'next/link';
import { newsCategoryLabel } from '@/lib/newsCategories';
import { getTranslation } from '@/lib/i18n';

interface NewsDetailHeaderProps {
  news: NewsItem;
  locale: string;
}

export default function NewsDetailHeader({ news, locale }: NewsDetailHeaderProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale).news;

  return (
    <header className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-fg-muted">
        <Link href={`/${locale}/news/`} className="hover:text-fg transition-colors">
          {t.breadcrumb}
        </Link>
        <span aria-hidden="true" className="text-fg-disabled">/</span>
        <span className="text-fg-subtle">
          {newsCategoryLabel(news.category, locale)}
        </span>
        <span aria-hidden="true" className="text-fg-disabled">/</span>
        <span className="text-fg truncate max-w-[200px] sm:max-w-[400px]">
          {isPt ? news.title : news.titleEn}
        </span>
      </nav>

      {/* Title */}
      <h1 className="text-3xl sm:text-4xl font-bold text-fg leading-tight">
        {isPt ? news.title : news.titleEn}
      </h1>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" />
          {new Date(news.publishedAt).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" />
          {t.aiGenerated}
        </span>
        <span className="text-fg-subtle">
          {t.sourcePrefix} {news.source}
        </span>
      </div>
    </header>
  );
}
