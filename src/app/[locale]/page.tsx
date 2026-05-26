import { ALL_SPORTS } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MACRO_REGIONS } from '@/lib/regions';
import { loadSpotData } from '@/lib/load-spot-data';
import { SpotGridClient } from '@/components/spots/SpotGridClient';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import HomepageHero from '@/components/homepage/HomepageHero';
import HomepageTopNow from '@/components/homepage/HomepageTopNow';
import { StatCard } from '@/components/ui/Card';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  getTranslation(locale as Locale);

  const spotsData = loadSpotData();

  const now = Date.now();
  const timestamps = spotsData
    .map((d) => d.conditions.updatedAt)
    .filter((ts): ts is string => Boolean(ts))
    .map((ts) => new Date(ts).getTime());
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const minTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const hoursSinceMin = minTs ? (now - minTs) / 3600000 : Infinity;

  return (
    <div className="min-h-screen bg-bg-base">
      <h1 className="sr-only">
        {isPt
          ? `VenTu - ${spotsData.length} spots de surf, kitesurf e windsurf — condições actualizadas a cada 3 horas`
          : `VenTu - ${spotsData.length} surf, kitesurf and windsurf spots — conditions updated every 3 hours`}
      </h1>

      <HomepageHero
        locale={locale}
        spotsData={spotsData}
        maxTs={maxTs}
        hoursSinceMin={hoursSinceMin}
      />

      <HomepageTopNow spotsData={spotsData} locale={locale} />

      <SpotGridClient spotsData={spotsData} locale={locale} regions={[...MACRO_REGIONS]} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <DawnPatrolBanner locale={locale} />
      </div>

      <section className="border-t border-divider py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 0 } as React.CSSProperties}
            >
              <StatCard label={isPt ? 'Spots monitorizados' : 'Spots monitored'} value={spotsData.length} />
            </div>
            <div
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 80 } as React.CSSProperties}
            >
              <StatCard label={isPt ? 'Desportos' : 'Sports'} value={ALL_SPORTS.length} />
            </div>
            <div
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 160 } as React.CSSProperties}
            >
              <StatCard label={isPt ? 'Fonte de dados' : 'Data source'} value="Open-Meteo" />
            </div>
            <div
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 240 } as React.CSSProperties}
            >
              <StatCard label={isPt ? 'Open source' : 'Open source'} value="MIT" />
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
