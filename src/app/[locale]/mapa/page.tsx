import { locales } from '@/lib/i18n';
import { loadSpotData } from '@/lib/load-spot-data';
import { MACRO_REGIONS } from '@/lib/regions';
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo';
import MapaFullscreenClient from '@/components/spots/MapaFullscreenClient';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const loc = isPt ? 'pt' : 'en';

  const title = isPt ? 'Mapa de spots — VenTu' : 'Spots map — VenTu';
  const description = isPt
    ? `Mapa interactivo com ${SPOT_COUNT} spots em Portugal — filtros por desporto, região e score.`
    : `Interactive map of ${SPOT_COUNT} spots in Portugal — filter by sport, region and score.`;

  return buildPageMetadata({
    title,
    description,
    locale: loc,
    path: `/${loc}/mapa/`,
  });
}

export default async function MapaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const spotsData = loadSpotData();

  return (
    <MapaFullscreenClient
      spotsData={spotsData}
      regions={[...MACRO_REGIONS]}
      locale={locale}
    />
  );
}
