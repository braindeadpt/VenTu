import ContributionsAdminClient from '@/components/admin/ContributionsAdminClient';
import { getTranslation, locales } from '@/lib/i18n';
import type { Metadata } from 'next';

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';

  return {
    title: getTranslation(isPt ? 'pt' : 'en').admin.metaTitleContributions,
    robots: { index: false, follow: false },
  };
}

export default async function AdminContributionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return <ContributionsAdminClient locale={locale} />;
}
