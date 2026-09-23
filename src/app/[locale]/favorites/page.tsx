import { buildPageMetadata } from '@/lib/seo'
import { getTranslation, validateLocale } from '@/lib/i18n';
import FavoritesClient from '@/components/favorites/FavoritesClient';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';

  const loc = validateLocale(locale);
  return buildPageMetadata({
    title: getTranslation(loc).pages.favoritesMetaTitle,
    description: getTranslation(loc).pages.favoritesMetaDescription,
    locale: loc,
    path: `/${loc}/favorites/`,
  });
}

export default function FavoritesPage() {
  return <FavoritesClient />;
}
