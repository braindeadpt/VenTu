import ContributionsAdminClient from '@/components/admin/ContributionsAdminClient';
import { locales } from '@/lib/i18n';
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
    title: isPt ? 'Admin — Contribuições' : 'Admin — Contributions',
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
