import AuthCallbackClient from '@/components/auth/AuthCallbackClient';
import type { Metadata } from 'next';

// Magic-link callback — URL one-shot, nunca indexável
// (NOINDEX_ROUTE_PATHS em scripts/check-export-routes.js).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AuthCallbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AuthCallbackClient locale={locale} />;
}
