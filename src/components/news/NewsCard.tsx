'use client';

import { NewsItem } from '@/types';
import { ExternalLink, Clock, Sparkles } from 'lucide-react';

interface NewsCardProps {
  news: NewsItem;
  locale: string;
}

export default function NewsCard({ news, locale }: NewsCardProps) {
  const isPt = locale === 'pt';

  const categoryColors: Record<string, string> = {
    surf: 'bg-wave-500/20 text-wave-300',
    kitesurf: 'bg-wind-500/20 text-wind-300',
    windsurf: 'bg-ocean-500/20 text-ocean-300',
    competition: 'bg-purple-500/20 text-purple-300',
    safety: 'bg-red-500/20 text-red-300',
    general: 'bg-surf-500/20 text-surf-300',
  };

  return (
    <article className="glass-card overflow-hidden hover:bg-white/10 transition-all duration-300 group">
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[news.category] || categoryColors.general}`}>
            {news.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-white/40">
            <Clock className="w-3 h-3" />
            {new Date(news.publishedAt).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB')}
          </span>
          <span className="flex items-center gap-1 text-xs text-white/30">
            <Sparkles className="w-3 h-3" />
            {isPt ? 'IA' : 'AI'}
          </span>
        </div>

        <h3 className="text-lg font-semibold text-white/90 group-hover:text-white transition-colors line-clamp-2">
          {isPt ? news.title : news.titleEn}
        </h3>

        <p className="text-sm text-white/60 line-clamp-3 leading-relaxed">
          {isPt ? news.summary : news.summaryEn}
        </p>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-white/40">{news.source}</span>
          <a 
            href={news.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-ocean-400 hover:text-ocean-300 transition-colors"
          >
            {isPt ? 'Ler mais' : 'Read more'}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </article>
  );
}