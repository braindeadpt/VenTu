import { getTranslation, locales } from '@/lib/i18n';
import { loadSpotListings } from '@/lib/load-spot-data';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import { loadPipelineMeta, resolveDisplayUpdatedTs } from '@/lib/pipelineMeta';
import HomeAdaptive from '@/components/homepage/HomeAdaptive';
import MapTilePreconnect from '@/components/MapTilePreconnect';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getTranslation(locale);

  const spotsData = loadSpotListings();

  const timestamps = spotsData
    .map((d) => d.conditions.updatedAt)
    .filter((ts): ts is string => Boolean(ts))
    .map((ts) => new Date(ts).getTime());
  const spotMaxTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const pipelineMeta = loadPipelineMeta();
  const maxTs = resolveDisplayUpdatedTs(pipelineMeta, spotMaxTs);

  return (
    <div className="min-h-screen bg-bg-base">
      <MapTilePreconnect />
      <h1 className="sr-only">
        {t.hero.seoH1
          .replace('{count}', String(spotsData.length))
          .replace('{schedule}', pipelineSchedule(locale))}
      </h1>

      <HomeAdaptive
        locale={locale}
        spotsData={spotsData}
        maxTs={maxTs}
        spotCount={spotsData.length}
        sportsCount={7}
        buoyLayer={pipelineMeta?.buoyLayer ?? null}
        coastalWarningsLayer={pipelineMeta?.coastalWarningsLayer ?? null}
      />
    </div>
  );
}
