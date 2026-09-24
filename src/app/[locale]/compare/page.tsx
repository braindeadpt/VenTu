import { buildPageMetadata } from '@/lib/seo'
import CompareClient from '@/components/compare/CompareClient';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import { getTranslation, validateLocale } from '@/lib/i18n';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const cmp = getTranslation(locale).compare;

  const loc = validateLocale(locale);
  return buildPageMetadata({
    title: cmp.metaTitle,
    description: cmp.metaDescription.replace('{schedule}', pipelineSchedule(loc)),
    locale: loc,
    path: `/${loc}/compare/`,
  });
}

export default function ComparePage() {
  return <CompareClient />;
}
