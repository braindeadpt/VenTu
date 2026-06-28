'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Newspaper } from 'lucide-react';
import type { Spot } from '@/types';
import type { NewsItem } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import { getRelatedNewsForSpot, newsSlug } from '@/lib/news';

interface SpotRelatedNewsProps {
  spot: Spot;
  locale: string;
  sport: SportType;
}

export default function SpotRelatedNews({ spot, locale, sport }: SpotRelatedNewsProps) {
  const isPt = locale === 'pt';
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(getAssetPath('/data/news.json'))
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NewsItem[]) => {
        if (!cancelled) {
          setNews(Array.isArray(data) ? data : []);
          setLoaded(true);
        }
      })
      .catch((err) => {
        console.warn('Failed to load related news:', err);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const related = useMemo(
    () => (loaded ? getRelatedNewsForSpot(news, spot, { sport, limit: 4 }) : []),
    [loaded, news, spot, sport],
  );

  if (!loaded || related.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-h2 text-fg">
          {isPt ? 'Notícias relacionadas' : 'Related news'}
        </h2>
        <Link
          href={`/${locale}/news/?region=pt&category=${sport}`}
          className="text-sm text-data-waves hover:underline shrink-0"
        >
          {isPt ? 'Ver mais' : 'View more'}
        </Link>
      </div>

      <ul className="space-y-3">
        {related.map((item) => {
          const title = isPt ? item.title : item.titleEn || item.title;
          const summary = isPt ? item.summary : item.summaryEn || item.summary;
          const internalSlug = newsSlug(item);
          return (
            <li key={item.id} className="card-1 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-card bg-data-waves/10 p-2 text-data-waves shrink-0">
                  <Newspaper className="w-4 h-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-meta-sm text-fg-subtle mb-1">
                    {item.source}
                    {item.sourceRegion === 'pt' ? (isPt ? ' · Cena PT' : ' · PT') : ''}
                    {' · '}
                    <span className="capitalize">{item.category}</span>
                  </p>
                  <Link
                    href={`/${locale}/news/${internalSlug}/`}
                    className="text-h3 text-fg hover:text-data-waves transition-colors line-clamp-2"
                  >
                    {title}
                  </Link>
                  {summary && (
                    <p className="text-sm text-fg-muted mt-1 line-clamp-2">{summary}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2">
                    <Link
                      href={`/${locale}/news/${internalSlug}/`}
                      className="text-sm font-medium text-data-waves hover:underline"
                    >
                      {isPt ? 'Ler resumo' : 'Read summary'}
                    </Link>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
                      >
                        {isPt ? 'Fonte' : 'Source'}
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
