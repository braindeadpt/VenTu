import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { loadSpotData } from '@/lib/load-spot-data';
import HomepageMapHero from '@/components/homepage/HomepageMapHero';
import HomepageTopNow from '@/components/homepage/HomepageTopNow';
import HomepageFooterSection from '@/components/homepage/HomepageFooterSection';
import { DawnPatrolTopSlot } from '@/components/homepage/HomeDawnPatrolSlots';
import WaveDivider from '@/components/ui/WaveDivider';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  getTranslation(locale as Locale);

  const spotsData = loadSpotData();

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

      <HomepageMapHero locale={locale} spotsData={spotsData} maxTs={maxTs} />

      <WaveDivider />

      <HomepageTopNow spotsData={spotsData} locale={locale} />

      <WaveDivider flip />

      <DawnPatrolTopSlot locale={locale} />

      <WaveDivider />

      <HomepageFooterSection locale={locale} spotCount={spotsData.length} sportsCount={7} />
    </div>
  );
}
