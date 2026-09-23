import { getTranslation } from '@/lib/i18n';
import FavoritesClient from '@/components/favorites/FavoritesClient';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';

  return {
    title: getTranslation(locale).pages.favoritesMetaTitle,
    description: getTranslation(locale).pages.favoritesMetaDescription,
    alternates: {
      canonical: `/${locale}/favorites/`,
      languages: { pt: '/pt/favorites/', en: '/en/favorites/' },
    },
  };
}

export default function FavoritesPage() {
  return <FavoritesClient />;
}
