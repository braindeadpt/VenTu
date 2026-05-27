import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MACRO_REGIONS } from '@/lib/regions';
import { loadSpotData } from '@/lib/load-spot-data';
import { getTopNowExcludedSlugs } from '@/lib/homepageSport';
import { SpotGridClient } from '@/components/spots/SpotGridClient';
import HomepageHero from '@/components/homepage/HomepageHero';
import HomepageTopNow from '@/components/homepage/HomepageTopNow';
import { DawnPatrolTopSlot, DawnPatrolBottomSlot } from '@/components/homepage/HomeDawnPatrolSlots';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  getTranslation(locale as Locale);

  const spotsData = loadSpotData();
  const topNowExcluded = getTopNowExcludedSlugs(spotsData);

  const timestamps = spotsData
    .map((d) => d.conditions.updatedAt)
    .filter((ts): ts is string => Boolean(ts))
    .map((ts) => new Date(ts).getTime());
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : null;

  return (
    <div className="min-h-screen bg-bg-base">
      <HomepageHero locale={locale} spotsData={spotsData} maxTs={maxTs} />

      <DawnPatrolTopSlot locale={locale} />

      <HomepageTopNow spotsData={spotsData} locale={locale} />

      <SpotGridClient
        spotsData={spotsData}
        locale={locale}
        regions={[...MACRO_REGIONS]}
        excludeTopNowSlugs={topNowExcluded}
      />

      <DawnPatrolBottomSlot locale={locale} />

      <footer className="border-t border-divider py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-meta text-fg-muted text-center">
            <span className="font-mono tabular-nums text-fg">{spotsData.length}</span>
            {isPt ? ' spots monitorizados' : ' spots monitored'}
            <span aria-hidden className="mx-2">·</span>
            Open-Meteo
            <span aria-hidden className="mx-2">·</span>
            MIT
          </p>
        </div>
      </footer>
    </div>
  );
}
