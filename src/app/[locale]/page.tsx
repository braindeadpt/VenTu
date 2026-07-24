import { getTranslation, locales } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { loadSpotData } from '@/lib/load-spot-data';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import { loadPipelineMeta, resolveDisplayUpdatedTs } from '@/lib/pipelineMeta';
import HomeAdaptive from '@/components/homepage/HomeAdaptive';

// es/de/fr: EN body via isPt branch; shell/nav/meta translated (SEO hreflang MVP).
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

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
  const spotMaxTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const pipelineMeta = loadPipelineMeta();
  const maxTs = resolveDisplayUpdatedTs(pipelineMeta, spotMaxTs);

  return (
    <div className="min-h-screen bg-bg-base">
      <h1 className="sr-only">
        {isPt
          ? `VenTu — ${spotsData.length} spots de surf, kitesurf e windsurf em Portugal, condições ${pipelineSchedule('pt')}`
          : `VenTu — ${spotsData.length} surf, kitesurf and windsurf spots in Portugal, conditions ${pipelineSchedule('en')}`}
      </h1>

      <HomeAdaptive
        locale={locale}
        spotsData={spotsData}
        maxTs={maxTs}
        spotCount={spotsData.length}
        sportsCount={7}
      />
    </div>
  );
}
