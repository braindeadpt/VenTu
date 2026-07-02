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
    title: isPt ? 'Favoritos — VenTu' : 'Favorites — VenTu',
    description: isPt
      ? 'Os teus spots favoritos com condições actualizadas — sincronizados na tua conta.'
      : 'Your favorite spots with updated conditions — synced to your account.',
    alternates: {
      canonical: `/${locale}/favorites/`,
      languages: { pt: '/pt/favorites/', en: '/en/favorites/' },
    },
  };
}

export default function FavoritesPage() {
  return <FavoritesClient />;
}
