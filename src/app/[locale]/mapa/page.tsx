import { getTranslation, validateLocale } from '@/lib/i18n';
import { locales } from '@/lib/i18n';
import { loadSpotListings } from '@/lib/load-spot-data';
import { MACRO_REGIONS } from '@/lib/regions';
import { buildPageMetadata, SPOT_COUNT } from '@/lib/seo';
import MapaFullscreenClient from '@/components/spots/MapaFullscreenClient';
import MapTilePreconnect from '@/components/MapTilePreconnect';
import type { Metadata } from 'next';

// es/de/fr: EN body via isPt branch; shell/nav/meta translated (SEO hreflang MVP).
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
  const loc = validateLocale(locale);

  const title = getTranslation(locale).pages.mapMetaTitle;
  const description = getTranslation(locale).pages.mapMetaDescription.replace(
    '{count}',
    String(SPOT_COUNT),
  );

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
