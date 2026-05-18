'use client';

import { NewsItem } from '@/types';
import { ExternalLink, Clock, Sparkles, Waves, Wind, Trophy, Shield, Newspaper, Mountain, Sailboat, Monitor, Triangle, Zap, AlertTriangle } from 'lucide-react';

interface NewsCardProps {
  news: NewsItem;
  locale: string;
  variant?: 'grid' | 'compact';
}

const categoryColors: Record<string, string> = {
  surf:       'bg-data-waves/12 text-data-waves border border-data-waves/25',
  kitesurf:   'bg-data-wind/12 text-data-wind border border-data-wind/25',
  windsurf:   'bg-data-waves/12 text-data-waves border border-data-waves/25',
  'big-wave': 'bg-windDir-offshore/12 text-windDir-offshore border border-windDir-offshore/25',
  sup:        'bg-data-water/12 text-data-water border border-data-water/25',
  foil:       'bg-score-fair/12 text-score-fair border border-score-fair/25',
  bodyboard:  'bg-data-period/12 text-data-period border border-data-period/25',
  wakeboard:  'bg-score-good/12 text-score-good border border-score-good/25',
  competition:'bg-data-period/12 text-data-period border border-data-period/25',
  safety:     'bg-windDir-onshore/12 text-windDir-onshore border border-windDir-onshore/25',
  general:    'bg-data-water/12 text-data-water border border-data-water/25',
  alert:      'bg-windDir-onshore/20 text-windDir-onshore border border-windDir-onshore/35',
};

const categoryIcons: Record<string, React.ReactNode> = {
  surf:        <Waves className="w-4 h-4" />,
  kitesurf:    <Wind className="w-4 h-4" />,
  windsurf:    <Sailboat className="w-4 h-4" />,
  'big-wave':  <Mountain className="w-4 h-4" />,
  sup:         <Monitor className="w-4 h-4" />,
  foil:        <Triangle className="w-4 h-4" />,
  bodyboard:   <Waves className="w-4 h-4" />,
  wakeboard:   <Zap className="w-4 h-4" />,
  competition: <Trophy className="w-4 h-4" />,
  safety:      <Shield className="w-4 h-4" />,
  general:     <Newspaper className="w-4 h-4" />,
  alert:       <AlertTriangle className="w-4 h-4" />,
};

export default function NewsCard({ news, locale, variant = 'grid' }: NewsCardProps) {
  const isPt = locale === 'pt';
  const catColor = categoryColors[news.category] || categoryColors.general;
  const catIcon = categoryIcons[news.category] || null;

  if (variant === 'compact') {
    return (
      <article className="flex items-start gap-3 py-3 border-b border-divider last:border-b-0">
        <span className={`mt-0.5 shrink-0 ${catColor.split(' ')[1]}`}>
          {catIcon}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-fg line-clamp-1 leading-snug">
            {isPt ? news.title : news.titleEn}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-fg-subtle">
              {new Date(news.publishedAt).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <span className="flex items-center gap-1 text-xs text-fg-subtle/80">
              <Sparkles className="w-2.5 h-2.5" />
              {isPt ? 'IA' : 'AI'}
            </span>
          </div>
        </div>
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-data-waves hover:text-data-waves/80 transition-colors"
          aria-label={isPt ? 'Ler artigo' : 'Read article'}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </article>
    );
  }

  return (
    <article className="glass-card overflow-hidden hover:bg-surface-2 transition-all duration-300 group">
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className={`${catColor.split(' ')[1]}`}>{catIcon}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${catColor}`}>
              {news.category}
            </span>
          </div>
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
