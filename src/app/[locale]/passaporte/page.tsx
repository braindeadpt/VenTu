import { locales } from '@/lib/i18n';
import type { Metadata } from 'next';
import PassaporteClient from '@/components/passaporte/PassaporteClient';

// es/de/fr: EN body via isPt branch; shell/nav/meta translated (SEO hreflang MVP).
interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  return {
    title: isPt ? 'Passaporte VenTu — Spots visitados' : 'VenTu Passport — Visited spots',
    description: isPt
      ? 'O teu passaporte de spots náuticos em Portugal. Vê quantos spots já visitaste, o breakdown por região e partilha o teu badge.'
      : 'Your watersports spot passport. See how many spots you have visited, the breakdown by region, and share your badge.',
  };
}

export default async function PassaportePage({ params }: Props) {
  const { locale } = await params;
  return <PassaporteClient locale={locale} />;
}