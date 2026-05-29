import { locales } from '@/lib/i18n';
import { loadSpotData } from '@/lib/load-spot-data';
import { MACRO_REGIONS } from '@/lib/regions';
import { spots } from '@/lib/spots';
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

  const title = isPt ? 'Mapa de spots — VenTu' : 'Spots map — VenTu';
  const description = isPt
    ? `Mapa interactivo com ${spots.length} spots em Portugal — filtros por desporto, região e nível.`
    : `Interactive map of ${spots.length} spots in Portugal — filter by sport, region and level.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/mapa/`,
      languages: { pt: '/pt/mapa/', en: '/en/mapa/' },
    },
    openGraph: { title, description },
  };
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
