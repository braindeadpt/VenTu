import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MACRO_REGIONS } from '@/lib/regions';
import { loadSpotData } from '@/lib/load-spot-data';
import { getTopNowExcludedSlugs } from '@/lib/homepageSport';
import { SpotGridClient } from '@/components/spots/SpotGridClient';
import HomepageHero from '@/components/homepage/HomepageHero';
import HomepageTopNow from '@/components/homepage/HomepageTopNow';
import TrustStrip from '@/components/homepage/TrustStrip';
import HomepageSecondaryCta from '@/components/homepage/HomepageSecondaryCta';
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
      <h1 className="sr-only">
        {isPt
          ? `VenTu — ${spotsData.length} spots de surf, kitesurf e windsurf em Portugal, condições actualizadas a cada 3 horas`
          : `VenTu — ${spotsData.length} surf, kitesurf and windsurf spots in Portugal, conditions updated every 3 hours`}
      </h1>

      <HomepageHero locale={locale} spotsData={spotsData} />

      <TrustStrip
        spotCount={spotsData.length}
        sportsCount={7}
        maxTs={maxTs}
        locale={locale}
      />

      <HomepageTopNow spotsData={spotsData} locale={locale} />

      <SpotGridClient
        spotsData={spotsData}
        locale={locale}
        regions={[...MACRO_REGIONS]}
        excludeTopNowSlugs={topNowExcluded}
      />

      <DawnPatrolTopSlot locale={locale} />

      <HomepageSecondaryCta locale={locale} />

      <DawnPatrolBottomSlot locale={locale} />
    </div>
  );
}
