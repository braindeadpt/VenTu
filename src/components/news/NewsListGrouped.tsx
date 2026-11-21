import type { DayGroup } from '@/lib/news';
import { pickLocale } from '@/lib/i18n';
import NewsCard from './NewsCard';

interface NewsListGroupedProps {
  groups: DayGroup[];
  locale: string;
}

export default function NewsListGrouped({ groups, locale }: NewsListGroupedProps) {

  return (
    <div className="space-y-10">
      {groups.map(group => (
        <section key={group.date}>
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-4">
            {pickLocale(locale, { pt: group.label, en: group.labelEn })}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {group.items.map(item => (
              <NewsCard key={item.id} news={item} locale={locale} variant="grid" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
