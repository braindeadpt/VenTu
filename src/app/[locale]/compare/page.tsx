import CompareClient from '@/components/compare/CompareClient';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import { getTranslation, validateLocale, locales } from '@/lib/i18n';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc = validateLocale(locale);
  const cmp = getTranslation(loc).compare;
  const languages = Object.fromEntries(locales.map((l) => [l, `/${l}/compare/`]));

  return {
    title: cmp.metaTitle,
    description: cmp.metaDescription.replace('{schedule}', pipelineSchedule(loc)),
    alternates: {
      canonical: `/${loc}/compare/`,
      languages,
    },
  };
}

export default function ComparePage() {
  return <CompareClient />;
}
