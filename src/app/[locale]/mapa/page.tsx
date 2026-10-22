import { getTranslation, validateLocale } from '@/lib/i18n';
import { locales } from '@/lib/i18n';
import { loadSpotListings } from '@/lib/load-spot-data';
import { serializeSpotListings } from '@/lib/spotListingsJson';
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
  // TBT /mapa: os ~185 spots seguem como UMA string JSON e não como árvore
  // de objectos. O RSC passava ~700 KB de modelo que o cliente percorria
  // valor a valor (no arranque e outra vez no prefetch do próprio /mapa pelo
  // cabeçalho); uma string grande vai como bloco de texto e o cliente faz um
  // só JSON.parse nativo. Os dados são os mesmos (teste de ida e volta).
  const spotsJson = serializeSpotListings(loadSpotListings());

  return (
    <>
      <MapTilePreconnect />
      <MapaFullscreenClient
        spotsJson={spotsJson}
        regions={[...MACRO_REGIONS]}
        locale={locale}
      />
    </>
  );
}
