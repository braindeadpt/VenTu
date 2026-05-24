import CompareClient from '@/components/compare/CompareClient';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';

  return {
    title: isPt ? 'Comparar Spots — VenTu' : 'Compare Spots — VenTu',
    description: isPt
      ? 'Compara condições entre 2-3 spots de surf, kitesurf e windsurf em Portugal — actualizadas a cada 3 horas.'
      : 'Compare conditions between 2-3 surf, kitesurf and windsurf spots in Portugal — updated every 3 hours.',
    alternates: {
      canonical: `/${locale}/compare/`,
      languages: { pt: '/pt/compare/', en: '/en/compare/' },
    },
  };
}

export default function ComparePage() {
  return <CompareClient />;
}
