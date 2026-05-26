'use client';

import { useEffect, useState } from 'react';
import { Map } from 'lucide-react';
import Button from '@/components/ui/Button';
import HomepageSearch from '@/components/ui/HomepageSearch';
import { getTranslation } from '@/lib/i18n';

interface HomepageHeroProps {
  locale: string;
  maxTs: number | null;
  hoursSinceMin: number;
  totalOnCount: number;
}

export default function HomepageHero({
  locale,
  maxTs,
  hoursSinceMin,
  totalOnCount,
}: HomepageHeroProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const [hoursAgo, setHoursAgo] = useState<number | null>(
    maxTs ? Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)) : null,
  );

  useEffect(() => {
    if (!maxTs) return;
    setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));
  }, [maxTs]);

  const dotColor =
    hoursSinceMin < 3
      ? 'bg-[rgb(var(--score-good))]'
      : hoursSinceMin < 12
        ? 'bg-[rgb(var(--score-fair))]'
        : 'bg-[rgb(var(--score-poor))]';

  const subline =
    totalOnCount > 0
      ? t.hero.heroSubline.replace('{count}', String(totalOnCount))
      : t.hero.heroSublineZero;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <div
        className="stagger-fade-in flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
        style={{ '--stagger-delay': 0 } as React.CSSProperties}
      >
        <div className="space-y-4 max-w-2xl">
          <span
            className="pill pill-ghost inline-flex items-center gap-1.5 px-2 py-1 min-h-0 text-meta motion-reduce:transition-none transition-opacity duration-150"
            title={
              isPt
                ? 'Hora da última actualização de condições'
                : 'Time of last conditions update'
            }
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden />
            {hoursAgo !== null ? (
              <span className="font-mono tabular-nums text-fg-muted">
                {t.hero.updatedAgo.replace('{hours}', String(hoursAgo))}
              </span>
            ) : (
              <span className="text-fg-muted">{t.hero.statusNoData}</span>
            )}
          </span>

          <h2 className="text-[clamp(1.75rem,4vw,2.25rem)] font-bold text-fg tracking-tight leading-[1.1]">
            {t.hero.heroHeadline}
          </h2>

          <p className="text-body-lg text-fg-muted">{subline}</p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 shrink-0">
          <Button
            href={`/${locale}/#explore-map`}
            size="lg"
            leftIcon={<Map className="w-4 h-4" aria-hidden />}
            locale={isPt ? 'pt' : 'en'}
          >
            {t.hero.exploreMap}
          </Button>
          <Button
            href={`/${locale}/spots/`}
            variant="secondary"
            size="lg"
            locale={isPt ? 'pt' : 'en'}
          >
            {t.hero.viewAllSpots}
          </Button>
        </div>
      </div>

      <div
        className="stagger-fade-in mt-6 max-w-md motion-reduce:animate-none"
        style={{ '--stagger-delay': 80 } as React.CSSProperties}
      >
        <HomepageSearch locale={locale} />
      </div>
    </section>
  );
}
