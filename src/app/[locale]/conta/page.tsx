import { getTranslation } from '@/lib/i18n';
import type { Metadata } from 'next';
import AccountClient from '@/components/account/AccountClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isPt = locale === 'pt';
  return {
    title: getTranslation(locale).pages.accountMetaTitle,
    description: getTranslation(locale).pages.accountMetaDescription,
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AccountClient locale={locale} />;
}
