import type { NewsItem } from '@/types';
import NewsCard from './NewsCard';
import { getTranslation } from '@/lib/i18n';

interface RelatedNewsProps {
  items: NewsItem[];
  locale: string;
}

export default function RelatedNews({ items, locale }: RelatedNewsProps) {
  const t = getTranslation(locale).news;

  if (items.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-divider">
      <h2 className="text-xl font-semibold text-fg mb-6">{t.related}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map(item => (
          <NewsCard key={item.id} news={item} locale={locale} variant="grid" />
        ))}
      </div>
    </section>
  );
}
