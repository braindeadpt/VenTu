import type { NewsItem } from '@/types';
import { Sparkles, Calendar } from 'lucide-react';
import Link from 'next/link';

interface NewsDetailHeaderProps {
  news: NewsItem;
  locale: string;
}

const categoryLabels: Record<string, { pt: string; en: string }> = {
  surf:        { pt: 'Surf',        en: 'Surf' },
  kitesurf:    { pt: 'Kitesurf',    en: 'Kitesurf' },
  windsurf:    { pt: 'Windsurf',    en: 'Windsurf' },
  competition: { pt: 'Competição',  en: 'Competition' },
  safety:      { pt: 'Segurança',   en: 'Safety' },
  general:     { pt: 'Geral',       en: 'General' },
};

export default function NewsDetailHeader({ news, locale }: NewsDetailHeaderProps) {
  const isPt = locale === 'pt';

  return (
    <header className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-fg-muted">
        <Link href={`/${locale}/news/`} className="hover:text-fg transition-colors">
          {isPt ? 'Notícias' : 'News'}
        </Link>
        <span aria-hidden="true" className="text-fg-disabled">/</span>
        <span className="text-fg-subtle">
          {isPt ? categoryLabels[news.category]?.pt || news.category : categoryLabels[news.category]?.en || news.category}
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
          {isPt ? 'Gerado por IA' : 'AI-generated'}
        </span>
        <span className="text-fg-subtle">
          {isPt ? 'Fonte:' : 'Source:'} {news.source}
        </span>
      </div>
    </header>
  );
}
