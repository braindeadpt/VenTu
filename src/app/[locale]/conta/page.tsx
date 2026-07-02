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
    title: isPt ? 'Conta — VenTu' : 'Account — VenTu',
    description: isPt
      ? 'Entrada com magic link e favoritos sincronizados.'
      : 'Magic link sign-in and synced favorites.',
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AccountClient locale={locale} />;
}
