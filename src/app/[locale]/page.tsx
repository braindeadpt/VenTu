import { getTranslation, locales } from '@/lib/i18n';
import { SPORTS_COUNT } from '@/lib/sportRatings';
import { loadSpotListings } from '@/lib/load-spot-data';
import { toHomepageSpotLite } from '@/lib/homepageSpotLite';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import { loadPipelineMeta, resolveDisplayUpdatedTs } from '@/lib/pipelineMeta';
import HomeAdaptive from '@/components/homepage/HomeAdaptive';
import HomeV6 from '@/components/home/v6/HomeV6';
import { costaCompacta, fotosCosta, metaCosta } from '@/lib/home/dadosHomeServidor';
import { loadForecastsBySpot } from '@/lib/load-spot-data';
import { filterGridSpots } from '@/lib/gridSpotFilters';
import { DEFAULT_REGION } from '@/lib/gridFilters';

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

  // Build-time clock for hydration parity: the observed-wave freshness gates
  // (resolveScoreWaveCorrection / isObservedWaveFresh) are evaluated at SSG
  // with Date.now() = build time. Threading this down lets the client
  // reproduce the exact baked verdict on first paint; after mount it switches
  // to the live clock (React #418 guard — same pattern as the spot page).
  const bakedAtMs = Date.now();

  // #183 home v6: as horas dos 19 spots da costa (o objecto da hora da página de spot, das
  // mesmas linhas do forecast), em colunas, 3 dias desde as 00h do build; o cliente escolhe
  // hoje e amanhã com o relógio real.
  const costa = costaCompacta(loadForecastsBySpot(), bakedAtMs);

  // #273: a linha do CTA do mapa diz quantos spots de kite/surf o /mapa mostra (o mesmo filtro dele)
  const nSpots = {
    kite: filterGridSpots(spotsData, 'kitesurf', DEFAULT_REGION).length,
    surf: filterGridSpots(spotsData, 'surf', DEFAULT_REGION).length,
  };

  // Payload RSC: sem descrições/dicas/perigos (só a página do spot os usa).
  const homeSpotsData = spotsData.map((r) => toHomepageSpotLite(r, locale));

  return (
    <div className="min-h-screen bg-bg-base">
      <h1 className="sr-only">
        {t.hero.seoH1
          .replace('{count}', String(spotsData.length))
          .replace('{sports}', String(SPORTS_COUNT))
          .replace('{schedule}', pipelineSchedule(locale))}
      </h1>

      <HomeV6 locale={locale} costa={costa} meta={metaCosta()} fotos={fotosCosta(locale)} agoraMs={bakedAtMs} nSpots={nSpots} />

      <HomeAdaptive
        locale={locale}
        spotsData={homeSpotsData}
        maxTs={maxTs}
        spotCount={spotsData.length}
        sportsCount={SPORTS_COUNT}
        buoyLayer={pipelineMeta?.buoyLayer ?? null}
        coastalWarningsLayer={pipelineMeta?.coastalWarningsLayer ?? null}
        bakedAtMs={bakedAtMs}
      />
    </div>
  );
}
