import CompareClient from '@/components/compare/CompareClient';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import { getTranslation } from '@/lib/i18n';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const cmp = getTranslation(isPt ? 'pt' : 'en').compare;

  return {
    title: cmp.metaTitle,
    description: cmp.metaDescription.replace(
      '{schedule}',
      pipelineSchedule(isPt ? 'pt' : 'en'),
    ),
    alternates: {
      canonical: `/${locale}/compare/`,
      languages: { pt: '/pt/compare/', en: '/en/compare/' },
    },
  };
}

export default function ComparePage() {
  return <CompareClient />;
}
