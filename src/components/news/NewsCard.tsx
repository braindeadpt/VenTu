'use client';

import { NewsItem } from '@/types';
import { ExternalLink, Clock, Sparkles } from 'lucide-react';

interface NewsCardProps {
  news: NewsItem;
  locale: string;
}

export default function NewsCard({ news, locale }: NewsCardProps) {
  const isPt = locale === 'pt';

  /* Badge tokens — theme-aware (solid text + tinted background + subtle border).
     Works in both dark (pastel-on-dark) and coast (saturated-on-light). */
  const categoryColors: Record<string, string> = {
    surf:       'bg-data-waves/12 text-data-waves border border-data-waves/25',
    kitesurf:   'bg-data-wind/12 text-data-wind border border-data-wind/25',
    windsurf:   'bg-data-waves/12 text-data-waves border border-data-waves/25',
    competition:'bg-data-period/12 text-data-period border border-data-period/25',
    safety:     'bg-windDir-onshore/12 text-windDir-onshore border border-windDir-onshore/25',
    general:    'bg-data-water/12 text-data-water border border-data-water/25',
  };

  return (
    <article className="glass-card overflow-hidden hover:bg-surface-2 transition-all duration-300 group">
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[news.category] || categoryColors.general}`}>
            {news.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-fg-subtle">
            <Clock className="w-3 h-3" />
            {new Date(news.publishedAt).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB')}
          </span>
          <span className="flex items-center gap-1 text-xs text-fg-subtle/80">
            <Sparkles className="w-3 h-3" />
            {isPt ? 'IA' : 'AI'}
          </span>
        </div>

        <h3 className="text-lg font-semibold text-fg group-hover:text-fg transition-colors line-clamp-2">
          {isPt ? news.title : news.titleEn}
        </h3>

        <p className="text-sm text-fg-muted line-clamp-3 leading-relaxed">
          {isPt ? news.summary : news.summaryEn}
        </p>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-fg-subtle">{news.source}</span>
          <a 
            href={news.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-data-waves hover:text-data-waves/80 transition-colors"
          >
            {isPt ? 'Ler mais' : 'Read more'}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </article>
  );
}