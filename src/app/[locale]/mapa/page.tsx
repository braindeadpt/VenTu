import { locales, validateLocale, pickLocale } from '@/lib/i18n';
import { loadSpotListings } from '@/lib/load-spot-data';
import { MACRO_REGIONS } from '@/lib/regions';
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo';
import MapaFullscreenClient from '@/components/spots/MapaFullscreenClient';
import MapTilePreconnect from '@/components/MapTilePreconnect';
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
  const loc = validateLocale(locale);

  const title = pickLocale(loc, {
    pt: 'Mapa de spots — VenTu',
    en: 'Spots map — VenTu',
    es: 'Mapa de spots — VenTu',
    de: 'Spots-Karte — VenTu',
    fr: 'Carte des spots — VenTu',
  });
  const description = pickLocale(loc, {
    pt: `Mapa interactivo com ${SPOT_COUNT} spots em Portugal — filtros por desporto, região e score.`,
    en: `Interactive map of ${SPOT_COUNT} spots in Portugal — filter by sport, region and score.`,
    es: `Mapa interactivo con ${SPOT_COUNT} spots en Portugal — filtros por deporte, región y score.`,
    de: `Interaktive Karte mit ${SPOT_COUNT} Spots in Portugal — Filter nach Sport, Region und Score.`,
    fr: `Carte interactive de ${SPOT_COUNT} spots au Portugal — filtres par sport, région et score.`,
  });

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
  const spotsData = loadSpotListings();

  return (
    <>
      <MapTilePreconnect />
      <MapaFullscreenClient
        spotsData={spotsData}
        regions={[...MACRO_REGIONS]}
        locale={locale}
      />
    </>
  );
}
